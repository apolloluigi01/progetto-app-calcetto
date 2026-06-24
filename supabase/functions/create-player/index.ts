import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";
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

// Gmail SMTP ha SPF/DKIM/DMARC affidabili gia' configurati da Google: a differenza del
// dominio sandbox di Resend (onboarding@resend.dev), e' accettato anche da Outlook/Hotmail/Libero.
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
    await client.close();
  }
}

async function sendConfirmationEmail(email: string, name: string, actionLink: string) {
  await sendEmail(
    email,
    "Conferma il tuo account - Calcetto App",
    `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#2e7d32;">Ciao ${name}!</h2>
        <p>Il tuo account su <strong>Calcetto App</strong> &egrave; stato creato. Conferma la tua email per poter accedere:</p>
        <p style="text-align:center; margin: 32px 0;">
          <a href="${actionLink}" style="background:#2e7d32; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">Conferma email</a>
        </p>
        <p style="color:#888; font-size:12px;">Se non hai richiesto tu questo account, ignora questa email.</p>
      </div>
    `
  );
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

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo: `${appUrl}/login` },
  });

  if (linkError || !linkData.user) {
    return json({ error: linkError?.message ?? "Errore creazione utente" }, 400);
  }

  const { error: insertError } = await adminClient.from("players").insert({
    id: linkData.user.id,
    name,
    nickname: nickname ?? null,
    role: effectiveRole,
  });

  if (insertError) {
    await adminClient.auth.admin.deleteUser(linkData.user.id);
    return json({ error: insertError.message }, 400);
  }

  try {
    await sendConfirmationEmail(email, name, linkData.properties.action_link);
  } catch (emailErr) {
    return json({ id: linkData.user.id, email_warning: String(emailErr) });
  }

  return json({ id: linkData.user.id, pending_confirmation: true });
});
