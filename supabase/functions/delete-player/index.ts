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

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
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
    return json(req, { error: "Solo un admin puo' eliminare giocatori" }, 403);
  }

  const { playerId } = (await req.json()) as { playerId?: string };
  if (!playerId) {
    return json(req, { error: "playerId obbligatorio" }, 400);
  }

  if (playerId === callerData.user.id) {
    return json(req, { error: "Non puoi eliminare il tuo stesso account" }, 400);
  }

  const { data: targetPlayer, error: targetError } = await adminClient
    .from("players")
    .select("role, is_guest, deleted_at")
    .eq("id", playerId)
    .single();

  if (targetError || !targetPlayer) {
    return json(req, { error: "Giocatore non trovato" }, 404);
  }

  if (callerRole === "admin" && targetPlayer.role !== "player") {
    return json(req, { error: "Un admin puo' eliminare solo giocatori con ruolo player" }, 403);
  }

  if (targetPlayer.deleted_at) {
    return json(req, { error: "Questo giocatore risulta gia' rimosso" }, 400);
  }

  // Gli ospiti non hanno storico da preservare ne' account auth: si cancellano
  // davvero (la riga sparisce comunque con la partita, per cascade).
  if (targetPlayer.is_guest) {
    const { error: hardDeleteError } = await adminClient.from("players").delete().eq("id", playerId);
    if (hardDeleteError) return json(req, { error: hardDeleteError.message }, 400);
    return json(req, { success: true, mode: "guest" });
  }

  // Cancellazione logica: la riga resta (anonimizzata) perche' gol, presenze,
  // pagelle e voti passati la citano — un delete fisico riscriverebbe lo
  // storico e le classifiche. La RPC rimuove anche convocazioni, prenotazioni
  // e formazioni delle partite non ancora giocate.
  //
  // Nota: fino a questa versione la funzione cancellava solo l'utente auth,
  // contando su un cascade da auth.users a players che non esiste piu' (la FK
  // e' stata rimossa dalla migration sugli ospiti): la riga restava orfana.
  const { error: softDeleteError } = await adminClient.rpc("soft_delete_player", {
    p_player_id: playerId,
  });
  if (softDeleteError) {
    return json(req, { error: softDeleteError.message }, 400);
  }

  // L'account di accesso invece va eliminato davvero: e' il dato personale
  // (email, password) e da qui in poi nessuno deve poter entrare con quello.
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(playerId);
  if (deleteError) {
    return json(req, { error: `Giocatore rimosso, ma l'account di accesso non e' stato eliminato: ${deleteError.message}` }, 500);
  }

  return json(req, { success: true, mode: "soft" });
});
