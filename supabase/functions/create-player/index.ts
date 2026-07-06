import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const gmailUser      = Deno.env.get("GMAIL_USER")!;
const gmailPassword  = Deno.env.get("GMAIL_APP_PASSWORD")!;
const appUrl         = Deno.env.get("APP_URL") ?? "https://progetto-app-calcetto.vercel.app";

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

function welcomeHtml(name: string, email: string, confirmLink: string): string {
  return `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
    <div style="background:#2e7d32;border-radius:12px 12px 0 0;padding:20px 24px;">
      <h2 style="color:white;margin:0;font-size:20px;">⚽ Benvenuto in Pavone League!</h2>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px;">
      <p>Ciao <strong>${name}</strong>,</p>
      <p>Il tuo account è stato creato. Per attivarlo e scegliere la tua password, clicca sul pulsante qui sotto:</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${confirmLink.replace(/&/g, "&amp;")}"
           style="display:inline-block;background:#2e7d32;color:white;padding:14px 32px;
                  border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
          Attiva il tuo account
        </a>
      </div>
      <p style="color:#555;font-size:13px;">
        Accedi con questa email: <strong>${email}</strong>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        Se non ti aspettavi questo messaggio, puoi ignorarlo.
      </p>
    </div>
  </div>`;
}

async function sendWelcomeEmail(to: string, name: string, confirmLink: string): Promise<void> {
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
      subject: "Attiva il tuo account Pavone League",
      content: "text/html",
      html: welcomeHtml(name, to, confirmLink),
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
  const { email, password, name, surname, nickname, role } = body as {
    email: string;
    password: string;
    name: string;
    surname?: string;
    nickname?: string;
    role?: "admin" | "player" | "superadmin";
  };

  if (!email || !password || !name) {
    return json({ error: "email, password e name sono obbligatori" }, 400);
  }

  const effectiveRole = callerRole === "superadmin" ? (role ?? "player") : "player";

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
    surname: surname ?? null,
    nickname: nickname ?? null,
    role: effectiveRole,
    must_change_password: true,
  });

  if (insertError) {
    await adminClient.auth.admin.deleteUser(createData.user.id);
    return json({ error: insertError.message }, 400);
  }

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "signup",
    email,
    options: { redirectTo: `${appUrl}/imposta-password` },
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("generateLink fallito:", linkError?.message);
    return json({ id: createData.user.id, warning: "Utente creato ma email di benvenuto non inviata" });
  }

  // Il link punta alla nostra app (non direttamente all'endpoint di verifica di Supabase):
  // cosi' una GET automatica di uno scanner antispam non consuma il token monouso prima
  // che l'utente clicchi davvero. Il token viene verificato solo al submit del form password.
  const confirmLink = `${appUrl}/imposta-password?token_hash=${linkData.properties.hashed_token}&type=signup`;

  try {
    await sendWelcomeEmail(email, name, confirmLink);
  } catch (e) {
    console.error("Errore invio email:", e);
  }

  return json({ id: createData.user.id });
});
