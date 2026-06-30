import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey   = Deno.env.get("RESEND_API_KEY") ?? "";
const resendFrom     = Deno.env.get("RESEND_FROM") ?? "Pavone League <noreply@resend.dev>";

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

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY non configurata — email non inviata a", to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: resendFrom, to, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${await res.text()}`);
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
    adminClient.from("goals").select("team, players(name)").eq("match_id", matchId),
    adminClient
      .from("pagelle")
      .select("voto, titolo, descrizione, is_mvp, players(name)")
      .eq("match_id", matchId)
      .not("published_at", "is", null),
    adminClient.from("match_players").select("player_id").eq("match_id", matchId),
  ]);

  if (matchRes.error || !matchRes.data) return json({ error: "Partita non trovata" }, 404);

  type Named = { players: { name: string } | null };
  const goals   = (goalsRes.data ?? []) as unknown as (Named & { team: string })[];
  const pagelle = (pagelleRes.data ?? []) as unknown as (Named & {
    voto: string;
    titolo: string | null;
    descrizione: string | null;
    is_mvp: boolean;
  })[];

  const dateLabel = new Date(matchRes.data.match_date).toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
  });

  const scoreLine = resultRes.data
    ? `<p style="font-size:32px;font-weight:900;color:#2e7d32;text-align:center;margin:16px 0;">
         ${resultRes.data.score_a} — ${resultRes.data.score_b}
       </p>`
    : "";

  const campoLine = matchRes.data.field
    ? `<p style="text-align:center;color:#666;margin:0 0 16px;">📍 ${matchRes.data.field}</p>`
    : "";

  const goalsHtml = goals.length
    ? `<div style="margin:16px 0;">
         <h3 style="color:#2e7d32;margin:0 0 8px;">Marcatori</h3>
         <ul style="margin:0;padding-left:20px;">
           ${goals.map((g) => `<li>⚽ ${g.players?.name ?? "?"} — Squadra ${g.team}</li>`).join("")}
         </ul>
       </div>`
    : "";

  const mvp = pagelle.find((p) => p.is_mvp);
  const mvpBanner = mvp
    ? `<div style="background:#fff8e1;border:2px solid #f9a825;border-radius:10px;
                   padding:12px 16px;margin:16px 0;text-align:center;">
         <p style="margin:0;font-size:13px;color:#ef6c00;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">
           MVP della partita
         </p>
         <p style="margin:4px 0 0;font-size:20px;font-weight:900;color:#1a1a1a;">
           ★ ${mvp.players?.name ?? "?"}
         </p>
       </div>`
    : "";

  const pagelleHtml = pagelle.length
    ? `<div style="margin:16px 0;">
         <h3 style="color:#2e7d32;margin:0 0 8px;">Pagelle</h3>
         ${pagelle
           .map(
             (p) => `
           <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px;">
             <div style="display:flex;align-items:center;justify-content:space-between;">
               <span style="font-weight:700;font-size:15px;">${p.players?.name ?? "?"}</span>
               <span style="background:#2e7d32;color:white;border-radius:6px;
                            padding:2px 10px;font-weight:700;font-size:15px;">${p.voto}</span>
             </div>
             ${p.titolo ? `<p style="margin:6px 0 0;font-weight:600;color:#374151;">${p.titolo}</p>` : ""}
             ${p.descrizione ? `<p style="margin:6px 0 0;color:#6b7280;font-size:13px;">${p.descrizione}</p>` : ""}
           </div>`
           )
           .join("")}
       </div>`
    : "";

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <div style="background:#2e7d32;border-radius:12px 12px 0 0;padding:20px 24px;">
        <h2 style="color:white;margin:0;font-size:20px;">⚽ Pagelle disponibili</h2>
        <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:14px;">Partita del ${dateLabel}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px;">
        ${scoreLine}
        ${campoLine}
        ${mvpBanner}
        ${goalsHtml}
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
