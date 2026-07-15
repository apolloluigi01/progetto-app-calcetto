import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const gmailUser      = Deno.env.get("GMAIL_USER")!;
const gmailPassword  = Deno.env.get("GMAIL_APP_PASSWORD")!;

/** Stesso limite lato client: oltre il terzo reminder non si può andare. */
const MAX_REMINDERS = 3;
/** Stesso blocco delle formazioni: 15 minuti prima del calcio d'inizio. */
const LINEUP_LOCK_MINUTES = 15;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Comprimere l'HTML su un'unica riga evita le sequenze "=20" del
// quoted-printable generate dagli spazi a fine riga (vedi notify-match-published).
function minifyHtml(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

// Neutralizza eventuali caratteri speciali nel nome della lega (definito dagli
// utenti) prima di inserirlo nell'HTML della mail.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailPassword },
    },
  });
  try {
    await client.send({
      from: `Pavone League <${gmailUser}>`,
      to,
      subject,
      html: minifyHtml(html),
    });
  } finally {
    try { await client.close(); } catch (e) { console.error("SMTP close error:", e); }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return json({ error: "Not authenticated" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerPlayer } = await adminClient
    .from("players")
    .select("role")
    .eq("id", callerData.user.id)
    .single();

  if (!callerPlayer || (callerPlayer.role !== "admin" && callerPlayer.role !== "superadmin")) {
    return json({ error: "Solo un admin puo' inviare il reminder" }, 403);
  }

  const { leagueId, matchId } = (await req.json()) as { leagueId?: string; matchId?: string };
  if (!leagueId || !matchId) return json({ error: "leagueId e matchId obbligatori" }, 400);

  const [leagueRes, matchRes] = await Promise.all([
    adminClient.from("fanta_leagues").select("name").eq("id", leagueId).single(),
    adminClient
      .from("matches")
      .select("match_date, match_time, result:match_results(id)")
      .eq("id", matchId)
      .single(),
  ]);
  if (leagueRes.error || !leagueRes.data) return json({ error: "Lega non trovata" }, 404);
  if (matchRes.error || !matchRes.data) return json({ error: "Partita non trovata" }, 404);

  // Il reminder ha senso solo finché le formazioni sono ancora schierabili:
  // stesso blocco delle lineup (partita conclusa o meno di 15' al calcio d'inizio).
  const result = Array.isArray(matchRes.data.result) ? matchRes.data.result[0] : matchRes.data.result;
  if (result) return json({ error: "Partita già conclusa: le formazioni non sono più schierabili" }, 409);
  if (matchRes.data.match_time) {
    const kickoff = new Date(`${matchRes.data.match_date}T${matchRes.data.match_time}`);
    if (!isNaN(kickoff.getTime())) {
      const deadline = kickoff.getTime() - LINEUP_LOCK_MINUTES * 60 * 1000;
      if (Date.now() >= deadline) {
        return json({ error: "Formazioni bloccate: non è più possibile inviare reminder" }, 409);
      }
    }
  }

  const { count } = await adminClient
    .from("fanta_lineup_reminders")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId)
    .eq("match_id", matchId);
  const alreadySent = count ?? 0;
  if (alreadySent >= MAX_REMINDERS) {
    return json({ error: `Limite raggiunto: massimo ${MAX_REMINDERS} reminder per giornata` }, 409);
  }

  const { data: membersData } = await adminClient
    .from("fanta_league_members")
    .select("player_id")
    .eq("league_id", leagueId);
  const memberIds = ((membersData ?? []) as { player_id: string }[]).map((m) => m.player_id);
  if (memberIds.length === 0) return json({ error: "Nessun partecipante nella lega" }, 409);

  const dateLabel = new Date(matchRes.data.match_date).toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
  });

  // Nota encoding: il corpo usa SOLO caratteri ASCII, con entit&agrave; HTML per
  // accenti (&agrave;, &egrave;, &ugrave;...) ed emoji (&#9200;). Cos&igrave; i byte
  // trasmessi sono ASCII puro e la mail non pu&ograve; mai risultare "illeggibile"
  // per problemi di charset/quoted-printable, indipendentemente dal client.
  const leagueName = escapeHtml(leagueRes.data.name);
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <div style="background:#f57f17;border-radius:12px 12px 0 0;padding:20px 24px;">
        <h2 style="color:white;margin:0;font-size:20px;">&#9200; Promemoria Fantacalcetto</h2>
        <p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:14px;">${leagueName} &mdash; partita del ${dateLabel}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px;">
        <p style="font-size:15px;color:#374151;margin:0 0 12px;">Ciao!</p>
        <p style="font-size:15px;color:#374151;margin:0 0 12px;">
          Ti ricordiamo di <strong>schierare la formazione</strong> per la giornata di
          fantacalcetto della lega <strong>${leagueName}</strong>, relativa alla partita del ${dateLabel}.
        </p>
        <p style="font-size:15px;color:#374151;margin:0 0 12px;">
          Apri l'app Pavone League, entra nella tua lega e schiera la tua squadra prima che le
          formazioni vengano bloccate (15 minuti prima del calcio d'inizio).
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          Pavone League &mdash; promemoria inviato da un admin della lega.
        </p>
      </div>
    </div>`;

  const emails: string[] = [];
  for (const pid of memberIds) {
    const { data: userData } = await adminClient.auth.admin.getUserById(pid);
    if (userData?.user?.email) emails.push(userData.user.email);
  }

  const results = await Promise.allSettled(
    emails.map((email) =>
      sendEmail(email, `Fantacalcetto: schiera la formazione per la partita del ${dateLabel}`, html)
    )
  );

  const sent   = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason?.message ?? "errore sconosciuto");

  // Il reminder conta anche se qualche singolo invio fallisce: la finestra
  // dei 3 tentativi serve a evitare spam, non a garantire la consegna.
  await adminClient.from("fanta_lineup_reminders").insert({
    league_id: leagueId,
    match_id: matchId,
    sent_by: callerData.user.id,
  });

  return json({ sent, total: emails.length, remaining: MAX_REMINDERS - alreadySent - 1, failed });
});
