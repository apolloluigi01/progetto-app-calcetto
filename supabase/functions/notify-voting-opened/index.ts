import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
// Nuova secret key (sb_secret_...) con fallback alla legacy service_role.
const serviceRoleKey = Deno.env.get("SERVICE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const gmailUser      = Deno.env.get("GMAIL_USER")!;
const gmailPassword  = Deno.env.get("GMAIL_APP_PASSWORD")!;

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
    return json({ error: "Solo un admin puo' inviare questa notifica" }, 403);
  }

  const { matchId } = (await req.json()) as { matchId?: string };
  if (!matchId) return json({ error: "matchId obbligatorio" }, 400);

  const matchRes = await adminClient
    .from("matches")
    .select("match_date, match_time, field")
    .eq("id", matchId)
    .single();

  if (matchRes.error || !matchRes.data) return json({ error: "Partita non trovata" }, 404);

  type ParticipantRow = { player_id: string; players: { name: string; role: string } | null };
  const { data: participantsData } = await adminClient
    .from("match_players")
    .select("player_id, players(name, role)")
    .eq("match_id", matchId);
  const participants = (participantsData ?? []) as unknown as ParticipantRow[];

  // Regola: votano solo gli admin che partecipano alla partita. Caso limite:
  // se nessun admin/superadmin partecipa, votano i superadmin (anche esterni).
  const adminParticipants = participants.filter(
    (p) => p.players?.role === "admin" || p.players?.role === "superadmin",
  );

  let recipientIds: string[];
  let fallbackSuperadmin = false;
  if (adminParticipants.length > 0) {
    recipientIds = adminParticipants
      .map((p) => p.player_id)
      .filter((id) => id !== callerData.user.id);
  } else {
    fallbackSuperadmin = true;
    const { data: superadmins } = await adminClient
      .from("players")
      .select("id")
      .eq("role", "superadmin");
    recipientIds = ((superadmins ?? []) as { id: string }[])
      .map((s) => s.id)
      .filter((id) => id !== callerData.user.id);
  }

  const dateLabel = new Date(matchRes.data.match_date).toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
  });

  const campoLine = matchRes.data.field
    ? `<p style="text-align:center;color:#666;margin:0 0 12px;">📍 ${matchRes.data.field}</p>`
    : "";

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <div style="background:#7c3aed;border-radius:12px 12px 0 0;padding:20px 24px;">
        <h2 style="color:white;margin:0;font-size:20px;">🗳️ Votazioni aperte</h2>
        <p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:14px;">Partita del ${dateLabel}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px;">
        ${campoLine}
        <p style="font-size:14px;color:#374151;margin:0 0 12px;">
          ${fallbackSuperadmin
            ? "Nessun admin ha partecipato a questa partita: in qualità di superadmin sei chiamato tu a votare i giocatori."
            : "Le votazioni della partita a cui hai partecipato sono aperte: sei chiamato a votare i giocatori."}
        </p>
        <p style="font-size:14px;color:#374151;margin:0 0 12px;">
          Apri l'app Pavone League, entra nel dettaglio della partita e assegna un voto da 1 a 10 a
          ogni giocatore prima che le votazioni vengano chiuse.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          Pavone League — notifica automatica di apertura votazioni.
        </p>
      </div>
    </div>`;

  const emails: string[] = [];
  for (const pid of recipientIds) {
    const { data: userData } = await adminClient.auth.admin.getUserById(pid);
    if (userData?.user?.email) emails.push(userData.user.email);
  }

  const results = await Promise.allSettled(
    emails.map((email) =>
      sendEmail(email, `🗳️ Votazioni aperte per la partita del ${dateLabel}`, html)
    )
  );

  const sent   = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason?.message ?? "errore sconosciuto");

  return json({ sent, total: emails.length, fallbackSuperadmin, failed });
});
