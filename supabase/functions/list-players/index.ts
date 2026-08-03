import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
// Nuova secret key (sb_secret_...) con fallback alla legacy service_role.
const serviceRoleKey = Deno.env.get("SERVICE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// La verifica di chi chiama si fa con la chiave anonima: la chiave con pieni
// poteri non deve stare su un client che elabora un header arrivato da fuori.
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? serviceRoleKey;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json(req, { error: "Missing Authorization header" }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return json(req, { error: "Not authenticated" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerPlayer, error: callerPlayerError } = await adminClient
    .from("players")
    .select("role")
    .eq("id", callerData.user.id)
    .single();

  const callerRole = callerPlayer?.role;
  if (callerPlayerError || (callerRole !== "admin" && callerRole !== "superadmin")) {
    return json(req, { error: "Solo un admin puo' vedere questa lista" }, 403);
  }

  // I giocatori rimossi (cancellazione logica) restano nel database per non
  // spezzare lo storico, ma non hanno piu' nulla da mostrare in elenco.
  const { data: players, error: playersError } = await adminClient
    .from("players")
    .select("*")
    .is("deleted_at", null)
    .order("name");

  if (playersError) {
    return json(req, { error: playersError.message }, 400);
  }

  // Gli indirizzi arrivano da una sola query (RPC player_emails) invece di una
  // chiamata all'admin API per ogni giocatore.
  const ids = (players ?? []).map((p) => p.id);
  const { data: emailRows } = await adminClient.rpc("player_emails", { p_ids: ids });
  type EmailRow = { player_id: string; email: string; email_confirmed: boolean };
  const byId = new Map(((emailRows ?? []) as EmailRow[]).map((r) => [r.player_id, r]));

  const enriched = (players ?? []).map((p) => ({
    ...p,
    email: byId.get(p.id)?.email ?? null,
    email_confirmed: byId.get(p.id)?.email_confirmed ?? false,
  }));

  return json(req, { players: enriched });
});
