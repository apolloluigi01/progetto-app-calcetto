import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
// Nuova secret key (sb_secret_...) con fallback alla legacy service_role.
const serviceRoleKey = Deno.env.get("SERVICE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// La verifica di chi chiama si fa con la chiave anonima: la chiave con pieni
// poteri non deve stare su un client che elabora un header arrivato da fuori.
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? serviceRoleKey;
const gmailUser      = Deno.env.get("GMAIL_USER")!;
const gmailPassword  = Deno.env.get("GMAIL_APP_PASSWORD")!;

/** Stesso limite lato client: oltre il terzo reminder non si può andare. */
const MAX_REMINDERS = 3;
/** Stesso blocco delle formazioni: 15 minuti prima del calcio d'inizio. */
const LINEUP_LOCK_MINUTES = 15;

const appUrl = Deno.env.get("APP_URL") ?? "https://progetto-app-calcetto.vercel.app";

// CORS ristretto ai domini dell'app: prima era "*", quindi qualsiasi sito
// poteva far partire richieste verso questa funzione dal browser di un utente.
const ALLOWED_ORIGINS = new Set([
  appUrl,
  "https://progetto-app-calcetto.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
]);
// Le anteprime di Vercel hanno un sottodominio diverso a ogni deploy.
const PREVIEW_ORIGIN = /^https:\/\/progetto-app-calcetto[a-z0-9-]*\.vercel\.app$/;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : appUrl,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
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

/**
 * Invia lo stesso messaggio a piu' destinatari riusando UNA sola connessione
 * SMTP. Prima si apriva una connessione per destinatario, tutte in parallelo:
 * Gmail limita le connessioni contemporanee, quindi oltre una manciata di
 * destinatari una parte degli invii falliva. Qui un errore su un indirizzo non
 * ferma gli altri.
 */
async function sendBulk(
  recipients: string[],
  subject: string,
  html: string,
): Promise<{ sent: number; failed: string[] }> {
  if (recipients.length === 0) return { sent: 0, failed: [] };

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailPassword },
    },
  });

  const body = minifyHtml(html);
  let sent = 0;
  const failed: string[] = [];

  try {
    for (const to of recipients) {
      try {
        await client.send({ from: `Pavone League <${gmailUser}>`, to, subject, html: body });
        sent++;
      } catch (e) {
        failed.push(`${to}: ${e instanceof Error ? e.message : "errore sconosciuto"}`);
      }
    }
  } finally {
    try { await client.close(); } catch (e) { console.error("SMTP close error:", e); }
  }

  return { sent, failed };
}

/** Client Supabase, ridotto alla sola parte che serve qui. */
interface RpcClient {
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

/** Indirizzi dei destinatari in una sola query (RPC player_emails). */
async function recipientEmails(adminClient: RpcClient, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await adminClient.rpc("player_emails", { p_ids: ids });
  if (error) {
    console.error("player_emails:", error.message);
    return [];
  }
  return ((data ?? []) as { email: string }[]).map((r) => r.email).filter(Boolean);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(req, { error: "Missing Authorization header" }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return json(req, { error: "Not authenticated" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerPlayer } = await adminClient
    .from("players")
    .select("role")
    .eq("id", callerData.user.id)
    .single();

  if (!callerPlayer || (callerPlayer.role !== "admin" && callerPlayer.role !== "superadmin")) {
    return json(req, { error: "Solo un admin puo' inviare il reminder" }, 403);
  }

  const { leagueId, matchId } = (await req.json()) as { leagueId?: string; matchId?: string };
  if (!leagueId || !matchId) return json(req, { error: "leagueId e matchId obbligatori" }, 400);

  const [leagueRes, matchRes] = await Promise.all([
    adminClient.from("fanta_leagues").select("name").eq("id", leagueId).single(),
    adminClient
      .from("matches")
      .select("match_date, match_time, result:match_results(id)")
      .eq("id", matchId)
      .single(),
  ]);
  if (leagueRes.error || !leagueRes.data) return json(req, { error: "Lega non trovata" }, 404);
  if (matchRes.error || !matchRes.data) return json(req, { error: "Partita non trovata" }, 404);

  // Il reminder ha senso solo finché le formazioni sono ancora schierabili:
  // stesso blocco delle lineup (partita conclusa o meno di 15' al calcio d'inizio).
  const result = Array.isArray(matchRes.data.result) ? matchRes.data.result[0] : matchRes.data.result;
  if (result) return json(req, { error: "Partita già conclusa: le formazioni non sono più schierabili" }, 409);
  if (matchRes.data.match_time) {
    const kickoff = new Date(`${matchRes.data.match_date}T${matchRes.data.match_time}`);
    if (!isNaN(kickoff.getTime())) {
      const deadline = kickoff.getTime() - LINEUP_LOCK_MINUTES * 60 * 1000;
      if (Date.now() >= deadline) {
        return json(req, { error: "Formazioni bloccate: non è più possibile inviare reminder" }, 409);
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
    return json(req, { error: `Limite raggiunto: massimo ${MAX_REMINDERS} reminder per giornata` }, 409);
  }

  const { data: membersData } = await adminClient
    .from("fanta_league_members")
    .select("player_id")
    .eq("league_id", leagueId);
  const memberIds = ((membersData ?? []) as { player_id: string }[]).map((m) => m.player_id);
  if (memberIds.length === 0) return json(req, { error: "Nessun partecipante nella lega" }, 409);

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

  const emails = await recipientEmails(adminClient, memberIds);
  const { sent, failed } = await sendBulk(emails, `Fantacalcetto: schiera la formazione per la partita del ${dateLabel}`, html);

  // Il reminder conta anche se qualche singolo invio fallisce: la finestra
  // dei 3 tentativi serve a evitare spam, non a garantire la consegna.
  await adminClient.from("fanta_lineup_reminders").insert({
    league_id: leagueId,
    match_id: matchId,
    sent_by: callerData.user.id,
  });

  return json(req, { sent, total: emails.length, remaining: MAX_REMINDERS - alreadySent - 1, failed });
});
