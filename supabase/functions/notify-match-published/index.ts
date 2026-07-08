import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

// Il client SMTP codifica in quoted-printable eventuali spazi seguiti da a-capo:
// se il markup contiene righe con solo indentazione (dovute ai template multilinea)
// questo genera sequenze "=20" visibili nella mail. Comprimendo l'HTML su un'unica
// riga si evita del tutto questo scenario.
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

  const [matchRes, resultRes, goalsRes, pagelleRes, matchPlayersRes] = await Promise.all([
    adminClient.from("matches").select("match_date, field").eq("id", matchId).single(),
    adminClient.from("match_results").select("score_a, score_b").eq("match_id", matchId).maybeSingle(),
    adminClient.from("goals").select("team, is_own_goal, players(name, nickname)").eq("match_id", matchId),
    adminClient
      .from("pagelle")
      .select("player_id, voto, titolo, descrizione, is_mvp, players(name, nickname)")
      .eq("match_id", matchId)
      .not("published_at", "is", null),
    adminClient.from("match_players").select("player_id, team").eq("match_id", matchId),
  ]);

  if (matchRes.error || !matchRes.data) return json({ error: "Partita non trovata" }, 404);

  // Nei riepiloghi si mostra il nickname (univoco), col nome come fallback.
  type Named = { players: { name: string; nickname: string | null } | null };
  const displayName = (p: Named) => p.players?.nickname ?? p.players?.name ?? "?";
  const goals = (goalsRes.data ?? []) as unknown as (Named & { team: string; is_own_goal: boolean })[];
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

  function goalRow(g: Named & { is_own_goal: boolean }) {
    return `<p style="margin:2px 0;font-size:13px;color:#374151;">⚽ ${displayName(g)}${g.is_own_goal ? ' <span style="color:#dc2626;font-size:11px;">(ag)</span>' : ""}</p>`;
  }

  const goalsA = goals.filter((g) => g.team === "A");
  const goalsB = goals.filter((g) => g.team === "B");

  const scoreboardHtml = `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
      <tr>
        <td style="width:33%;vertical-align:top;text-align:left;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#2e7d32;">Squadra A</p>
          ${goalsA.length ? goalsA.map(goalRow).join("") : '<p style="margin:0;font-size:13px;color:#9ca3af;">—</p>'}
        </td>
        <td style="width:34%;vertical-align:middle;text-align:center;">
          ${resultRes.data
            ? `<p style="font-size:32px;font-weight:900;color:#2e7d32;margin:0;white-space:nowrap;">${resultRes.data.score_a} - ${resultRes.data.score_b}</p>`
            : ""}
        </td>
        <td style="width:33%;vertical-align:top;text-align:right;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#e65100;">Squadra B</p>
          ${goalsB.length ? goalsB.map(goalRow).join("") : '<p style="margin:0;font-size:13px;color:#9ca3af;">—</p>'}
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
  const emails: string[] = [];
  for (const pid of playerIds) {
    const { data: userData } = await adminClient.auth.admin.getUserById(pid);
    if (userData?.user?.email) emails.push(userData.user.email);
  }

  const results = await Promise.allSettled(
    emails.map((email) =>
      sendEmail(email, `⚽ Pagelle della partita del ${dateLabel} disponibili!`, html)
    )
  );

  const sent   = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason?.message ?? "errore sconosciuto");

  return json({ sent, total: emails.length, failed });
});
