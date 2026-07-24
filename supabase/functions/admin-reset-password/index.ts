import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
// Nuova secret key (sb_secret_...) con fallback alla legacy service_role.
const serviceRoleKey = Deno.env.get("SERVICE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  const { data: callerPlayer, error: callerPlayerError } = await adminClient
    .from("players")
    .select("role")
    .eq("id", callerData.user.id)
    .single();

  const callerRole = callerPlayer?.role;
  if (callerPlayerError || (callerRole !== "admin" && callerRole !== "superadmin")) {
    return json({ error: "Solo un admin puo' reimpostare le password" }, 403);
  }

  const { playerId, newPassword } = (await req.json()) as { playerId?: string; newPassword?: string };
  if (!playerId || !newPassword) {
    return json({ error: "playerId e newPassword sono obbligatori" }, 400);
  }
  if (newPassword.length < 6) {
    return json({ error: "La password deve essere di almeno 6 caratteri" }, 400);
  }

  const { data: targetPlayer, error: targetError } = await adminClient
    .from("players")
    .select("role")
    .eq("id", playerId)
    .single();

  if (targetError || !targetPlayer) {
    return json({ error: "Giocatore non trovato" }, 404);
  }

  // stesso vincolo di delete-player: un admin (non superadmin) puo' agire solo sui 'player'
  if (callerRole === "admin" && targetPlayer.role !== "player") {
    return json({ error: "Un admin puo' reimpostare solo la password di giocatori con ruolo player" }, 403);
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(playerId, {
    password: newPassword,
  });
  if (updateError) {
    return json({ error: updateError.message }, 400);
  }

  // chi riceve una password impostata da un admin deve sceglierne una propria conforme al primo accesso
  await adminClient.from("players").update({ must_change_password: true }).eq("id", playerId);

  return json({ success: true });
});
