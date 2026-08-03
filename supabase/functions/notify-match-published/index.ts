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

// Il client SMTP codifica in quoted-printable eventuali spazi seguiti da a-capo:
// se il markup contiene righe con solo indentazione (dovute ai template multilinea)
// questo genera sequenze "=20" visibili nella mail. Comprimendo l'HTML su un'unica
// riga si evita del tutto questo scenario.
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

  const [matchRes, resultRes, goalsRes, assistsRes, pagelleRes, matchPlayersRes] = await Promise.all([
    adminClient.from("matches").select("match_date, field").eq("id", matchId).single(),
    adminClient.from("match_results").select("score_a, score_b").eq("match_id", matchId).maybeSingle(),
    adminClient.from("goals").select("player_id, team, is_own_goal, players(name, surname, nickname)").eq("match_id", matchId),
    adminClient.from("assists").select("player_id, team, players(name, surname, nickname)").eq("match_id", matchId),
    adminClient
      .from("pagelle")
      .select("player_id, voto, titolo, descrizione, is_mvp, players(name, surname, nickname)")
      .eq("match_id", matchId)
      .not("published_at", "is", null),
    adminClient.from("match_players").select("player_id, team").eq("match_id", matchId),
  ]);

  if (matchRes.error || !matchRes.data) return json(req, { error: "Partita non trovata" }, 404);

  // I nomi seguono la stessa convenzione dell'app (PlayerName): nome e cognome,
  // con il soprannome come riferimento piccolo sotto.
  type Named = { players: { name: string; surname: string | null; nickname: string | null } | null };
  const displayName = (p: Named) =>
    p.players ? (p.players.surname ? `${p.players.name} ${p.players.surname}` : p.players.name) : "?";
  const nicknameLine = (p: Named, extraStyle = "") =>
    p.players?.nickname
      ? `<p style="margin:0;font-size:11px;color:#9ca3af;${extraStyle}">${p.players.nickname}</p>`
      : "";
  const goals = (goalsRes.data ?? []) as unknown as (Named & { player_id: string; team: string; is_own_goal: boolean })[];
  const assists = (assistsRes.data ?? []) as unknown as (Named & { player_id: string; team: string })[];
  const pagelle = (pagelleRes.data ?? []) as unknown as (Named & {
    player_id: string;
    voto: string;
    titolo: string | null;
    descrizione: string | null;
    is_mvp: boolean;
  })[];
  const teamByPlayerId = new Map(
    ((matchPlayersRes.data ?? []) as { player_id: string; team: string }[]).map((mp) => [mp.player_id, mp.team])
  );

  const dateLabel = new Date(matchRes.data.match_date).toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
  });

  const campoLine = matchRes.data.field
    ? `<p style="text-align:center;color:#666;margin:0 0 16px;">📍 ${matchRes.data.field}</p>`
    : "";

  // Tabellino per giocatore: gol e assist non più come righe ripetute, ma
  // raggruppati per giocatore con i simboli affianco al nome (⚽ per gol,
  // 🅰️ per assist). Gli autogol restano marcati "(ag)".
  type ScorerAgg = Named & { player_id: string; goals: number; ownGoals: number; assists: number };
  function aggregateTeam(team: "A" | "B"): ScorerAgg[] {
    const map = new Map<string, ScorerAgg>();
    const ensure = (p: Named & { player_id: string }) => {
      let e = map.get(p.player_id);
      if (!e) {
        e = { player_id: p.player_id, players: p.players, goals: 0, ownGoals: 0, assists: 0 };
        map.set(p.player_id, e);
      }
      return e;
    };
    for (const g of goals.filter((g) => g.team === team)) {
      const e = ensure(g);
      if (g.is_own_goal) e.ownGoals += 1;
      else e.goals += 1;
    }
    for (const a of assists.filter((a) => a.team === team)) ensure(a).assists += 1;
    return [...map.values()].sort(
      (x, y) => y.goals + y.ownGoals + y.assists - (x.goals + x.ownGoals + x.assists) || y.goals - x.goals,
    );
  }

  function scorerRow(e: ScorerAgg, align: "left" | "right") {
    const badges =
      "⚽".repeat(e.goals) +
      (e.ownGoals > 0 ? `<span style="color:#dc2626;">${"⚽".repeat(e.ownGoals)}<span style="font-size:11px;"> (ag)</span></span>` : "") +
      "🅰️".repeat(e.assists);
    return `
      <div style="margin:2px 0 6px;text-align:${align};">
        <p style="margin:0;font-size:13px;color:#374151;">${displayName(e)} <span style="white-space:nowrap;">${badges}</span></p>
        ${nicknameLine(e)}
      </div>`;
  }

  function teamScorersHtml(team: "A" | "B", align: "left" | "right") {
    const entries = aggregateTeam(team);
    if (entries.length === 0) {
      return '<p style="margin:0;font-size:13px;color:#9ca3af;">—</p>';
    }
    return entries.map((e) => scorerRow(e, align)).join("");
  }

  const scoreboardHtml = `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
      <tr>
        <td style="width:33%;vertical-align:top;text-align:left;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#2e7d32;">Squadra A</p>
          ${teamScorersHtml("A", "left")}
        </td>
        <td style="width:34%;vertical-align:middle;text-align:center;">
          ${resultRes.data
            ? `<p style="font-size:32px;font-weight:900;color:#2e7d32;margin:0;white-space:nowrap;">${resultRes.data.score_a} - ${resultRes.data.score_b}</p>`
            : ""}
        </td>
        <td style="width:33%;vertical-align:top;text-align:right;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#e65100;">Squadra B</p>
          ${teamScorersHtml("B", "right")}
        </td>
      </tr>
    </table>`;

  function pagellaCard(p: (typeof pagelle)[number]) {
    return `
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px;">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="text-align:left;">
              <span style="font-weight:700;font-size:15px;">${displayName(p)}</span>
              ${p.is_mvp
                ? '<span style="margin-left:6px;background:#fff8e1;color:#ef6c00;border:1px solid #f9a825;border-radius:999px;padding:1px 8px;font-weight:700;font-size:11px;">★ MVP</span>'
                : ""}
              ${nicknameLine(p)}
            </td>
            <td style="text-align:right;">
              <span style="background:#2e7d32;color:white;border-radius:6px;padding:2px 10px;font-weight:700;font-size:15px;">${p.voto}</span>
            </td>
          </tr>
        </table>
        ${p.titolo ? `<p style="margin:6px 0 0;font-weight:600;color:#374151;">${p.titolo}</p>` : ""}
        ${p.descrizione ? `<p style="margin:6px 0 0;color:#6b7280;font-size:13px;">${p.descrizione}</p>` : ""}
      </div>`;
  }

  function teamPagelleHtml(team: "A" | "B", label: string, color: string) {
    const teamPagelle = pagelle.filter((p) => teamByPlayerId.get(p.player_id) === team);
    if (teamPagelle.length === 0) return "";
    return `
      <h4 style="margin:14px 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${color};">${label}</h4>
      ${teamPagelle.map(pagellaCard).join("")}`;
  }

  const pagelleHtml = pagelle.length
    ? `<div style="margin:16px 0;">
         <h3 style="color:#2e7d32;margin:0 0 4px;">Pagelle</h3>
         ${teamPagelleHtml("A", "Squadra A", "#2e7d32")}
         ${teamPagelleHtml("B", "Squadra B", "#e65100")}
       </div>`
    : "";

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <div style="background:#2e7d32;border-radius:12px 12px 0 0;padding:20px 24px;">
        <h2 style="color:white;margin:0;font-size:20px;">⚽ Pagelle disponibili</h2>
        <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:14px;">Partita del ${dateLabel}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px;">
        ${scoreboardHtml}
        ${campoLine}
        ${pagelleHtml}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          Pavone League — le pagelle sono ora visibili anche nell'app.
        </p>
      </div>
    </div>`;

  const playerIds = (matchPlayersRes.data ?? []).map((mp) => mp.player_id);
  const emails = await recipientEmails(adminClient, playerIds);
  const { sent, failed } = await sendBulk(emails, `⚽ Pagelle della partita del ${dateLabel} disponibili!`, html);

  return json(req, { sent, total: emails.length, failed });
});
