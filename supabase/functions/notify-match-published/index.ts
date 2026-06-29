import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const gmailUser = Deno.env.get("GMAIL_USER")!;
const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD")!;

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

async function sendEmail(to: string, subject: string, html: string) {
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailAppPassword },
    },
  });
  try {
    await client.send({ from: `Calcetto App <${gmailUser}>`, to, subject, content: "text/html", html });
  } finally {
    // denomailer puo' lanciare un TypeError interno su close() se la connessione non si e' mai
    // stabilita (es. credenziali errate): non deve mascherare l'errore originale di send().
    try {
      await client.close();
    } catch (closeErr) {
      console.error("Errore chiusura client SMTP:", closeErr);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return json({ error: "Not authenticated" }, 401);
  }

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
  if (!matchId) {
    return json({ error: "matchId obbligatorio" }, 400);
  }

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

  if (matchRes.error || !matchRes.data) {
    return json({ error: "Partita non trovata" }, 404);
  }

  type Named = { players: { name: string } | null };
  const goals = (goalsRes.data ?? []) as unknown as (Named & { team: string })[];
  const pagelle = (pagelleRes.data ?? []) as unknown as (Named & {
    voto: string;
    titolo: string | null;
    descrizione: string | null;
    is_mvp: boolean;
  })[];

  const dateLabel = new Date(matchRes.data.match_date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const scoreLine = resultRes.data
    ? `<p style="font-size:28px;font-weight:bold;color:#2e7d32;text-align:center;">${resultRes.data.score_a} - ${resultRes.data.score_b}</p>`
    : "";

  const goalsHtml = goals.length
    ? `<h3>Marcatori</h3><ul>${goals
        .map((g) => `<li>⚽ ${g.players?.name ?? "?"} (Squadra ${g.team})</li>`)
        .join("")}</ul>`
    : "";

  const pagelleHtml = pagelle.length
    ? `<h3>Pagelle</h3>${pagelle
        .map(
          (p) => `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;">
          <p style="margin:0;font-weight:bold;">${p.players?.name ?? "?"} ${p.is_mvp ? "★ MVP" : ""} — <span style="color:#2e7d32;">${p.voto}</span></p>
          ${p.titolo ? `<p style="margin:4px 0 0;font-weight:600;">${p.titolo}</p>` : ""}
          ${p.descrizione ? `<p style="margin:4px 0 0;color:#555;">${p.descrizione}</p>` : ""}
        </div>`
        )
        .join("")}`
    : "";

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color:#2e7d32;">Pagelle della partita del ${dateLabel}</h2>
      ${scoreLine}
      ${goalsHtml}
      ${pagelleHtml}
    </div>
  `;

  const playerIds = (matchPlayersRes.data ?? []).map((mp) => mp.player_id);
  const emails: string[] = [];
  for (const pid of playerIds) {
    const { data: userData } = await adminClient.auth.admin.getUserById(pid);
    if (userData?.user?.email) emails.push(userData.user.email);
  }

  const results = await Promise.allSettled(
    emails.map((email) => sendEmail(email, `Le pagelle della partita del ${dateLabel} sono disponibili!`, html))
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;

  return json({ sent, total: emails.length });
});
