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
    return json(req, { error: "Solo un admin puo' inviare questa notifica" }, 403);
  }

  const { matchId } = (await req.json()) as { matchId?: string };
  if (!matchId) return json(req, { error: "matchId obbligatorio" }, 400);

  const matchRes = await adminClient
    .from("matches")
    .select("match_date, match_time, field, voting_admins_only")
    .eq("id", matchId)
    .single();

  if (matchRes.error || !matchRes.data) return json(req, { error: "Partita non trovata" }, 404);

  type ParticipantRow = { player_id: string; players: { name: string; role: string } | null };
  const { data: participantsData } = await adminClient
    .from("match_players")
    .select("player_id, players(name, role)")
    .eq("match_id", matchId);
  const participants = (participantsData ?? []) as unknown as ParticipantRow[];

  // Chi vota lo sceglie l'admin all'apertura (matches.voting_admins_only):
  // - tutti i partecipanti: la mail va a tutti quelli che hanno giocato;
  // - solo admin: la mail va agli admin che hanno giocato. Caso limite: se
  //   nessun admin/superadmin partecipa, votano i superadmin (anche esterni).
  const adminsOnly = !!matchRes.data.voting_admins_only;
  const adminParticipants = participants.filter(
    (p) => p.players?.role === "admin" || p.players?.role === "superadmin",
  );

  let recipientIds: string[];
  let fallbackSuperadmin = false;
  if (!adminsOnly && participants.length > 0) {
    recipientIds = participants
      .map((p) => p.player_id)
      .filter((id) => id !== callerData.user.id);
  } else if (adminParticipants.length > 0) {
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
            : adminsOnly
              ? "Le votazioni della partita a cui hai partecipato sono aperte e riservate agli admin: sei chiamato a votare i giocatori."
              : "Le votazioni della partita a cui hai partecipato sono aperte: puoi votare i giocatori."}
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

  const emails = await recipientEmails(adminClient, recipientIds);
  const { sent, failed } = await sendBulk(emails, `🗳️ Votazioni aperte per la partita del ${dateLabel}`, html);

  return json(req, { sent, total: emails.length, fallbackSuperadmin, failed });
});
