import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    return json({ error: "Solo un admin puo' creare giocatori" }, 403);
  }

  const body = await req.json();
  const { email, password, name, nickname, role } = body as {
    email: string;
    password: string;
    name: string;
    nickname?: string;
    role?: "admin" | "player" | "superadmin";
  };

  if (!email || !password || !name) {
    return json({ error: "email, password e name sono obbligatori" }, 400);
  }

  // un admin (non superadmin) puo' creare solo giocatori 'player', a prescindere da cosa
  // venga richiesto dal client: il vincolo va imposto qui perche' questa function usa la
  // service role key e quindi bypassa le RLS sulla tabella players.
  const effectiveRole = callerRole === "superadmin" ? (role ?? "player") : "player";

  // email_confirm: true crea l'utente gia' confermato, cosi' puo' fare login subito senza
  // passare dalla mail di conferma (logica di conferma mail disattivata per il momento).
  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !createData.user) {
    return json({ error: createError?.message ?? "Errore creazione utente" }, 400);
  }

  const { error: insertError } = await adminClient.from("players").insert({
    id: createData.user.id,
    name,
    nickname: nickname ?? null,
    role: effectiveRole,
  });

  if (insertError) {
    await adminClient.auth.admin.deleteUser(createData.user.id);
    return json({ error: insertError.message }, 400);
  }

  return json({ id: createData.user.id });
});
