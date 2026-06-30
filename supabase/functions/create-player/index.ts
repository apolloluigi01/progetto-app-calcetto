import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey    = Deno.env.get("RESEND_API_KEY") ?? "";
const resendFrom      = Deno.env.get("RESEND_FROM") ?? "Pavone League <noreply@resend.dev>";
const appUrl          = Deno.env.get("APP_URL") ?? "https://progetto-app-calcetto.vercel.app";

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

function welcomeHtml(name: string, email: string, password: string, confirmLink: string): string {
  return `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
    <h2 style="color:#2e7d32;">Benvenuto in Pavone League, ${name}! ⚽</h2>
    <p>Il tuo account è stato creato da un amministratore. Ecco le tue credenziali:</p>
    <div style="background:#f4f4f4;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0;"><strong>Email:</strong> ${email}</p>
      <p style="margin:8px 0 0;"><strong>Password temporanea:</strong> <code style="background:#e8e8e8;padding:2px 6px;border-radius:4px;">${password}</code></p>
    </div>
    <p>Prima di accedere devi confermare il tuo indirizzo email cliccando qui sotto:</p>
    <a href="${confirmLink}"
       style="display:inline-block;background:#2e7d32;color:white;padding:12px 28px;
              border-radius:8px;text-decoration:none;font-weight:bold;margin:8px 0;">
      Conferma email e accedi
    </a>
    <p style="margin-top:24px;color:#555;font-size:13px;">
      Al primo accesso ti verrà chiesto di scegliere una nuova password personale.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="color:#999;font-size:12px;">
      Se non ti aspettavi questo messaggio, ignoralo pure.
    </p>
  </div>`;
}

async function sendWelcomeEmail(
  to: string,
  name: string,
  password: string,
  confirmLink: string,
): Promise<void> {
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY non configurata — email non inviata");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFrom,
      to,
      subject: `Benvenuto in Pavone League, ${name}!`,
      html: welcomeHtml(name, to, password, confirmLink),
    }),
  });
  if (!res.ok) {
    console.error("Resend error:", await res.text());
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

  const effectiveRole = callerRole === "superadmin" ? (role ?? "player") : "player";

  // email_confirm: false → l'utente deve confermare l'email prima di accedere
  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });

  if (createError || !createData.user) {
    return json({ error: createError?.message ?? "Errore creazione utente" }, 400);
  }

  const { error: insertError } = await adminClient.from("players").insert({
    id: createData.user.id,
    name,
    nickname: nickname ?? null,
    role: effectiveRole,
    must_change_password: true,
  });

  if (insertError) {
    await adminClient.auth.admin.deleteUser(createData.user.id);
    return json({ error: insertError.message }, 400);
  }

  // Genera il link di conferma email: quando cliccato, conferma la mail e reindirizza all'app
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "signup",
    email,
    options: { redirectTo: `${appUrl}/imposta-password` },
  });

  if (linkError || !linkData?.properties?.action_link) {
    console.error("generateLink fallito:", linkError?.message);
    return json({ id: createData.user.id, warning: "Utente creato ma email di benvenuto non inviata" });
  }

  await sendWelcomeEmail(email, name, password, linkData.properties.action_link);

  return json({ id: createData.user.id });
});
