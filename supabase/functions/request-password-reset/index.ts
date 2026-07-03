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
    await client.send({ from: `Pavone League <${gmailUser}>`, to, subject, content: "text/html", html });
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

// Risposta pubblica intenzionalmente generica: non deve rivelare se un'email esiste o no.
const GENERIC_RESPONSE = {
  message: "Se l'indirizzo esiste, riceverai una mail con le istruzioni per reimpostare la password.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const { email } = (await req.json()) as { email?: string };
  if (!email) {
    return json({ error: "email obbligatoria" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appUrl}/reset-password` },
  });

  if (linkError || !linkData.user) {
    // Utente non trovato o altro errore: non lo comunichiamo al chiamante.
    return json(GENERIC_RESPONSE);
  }

  try {
    await sendEmail(
      email,
      "Reimposta la tua password - Pavone League",
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#2e7d32;">Reimposta la tua password</h2>
          <p>Hai richiesto di reimpostare la password del tuo account su <strong>Pavone League</strong>. Clicca sul link qui sotto per scegliere una nuova password:</p>
          <p style="text-align:center; margin: 32px 0;">
            <a href="${linkData.properties.action_link}" style="background:#2e7d32; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">Reimposta password</a>
          </p>
          <p style="color:#888; font-size:12px;">Se non hai richiesto tu questa operazione, ignora questa email: la tua password attuale resta valida.</p>
        </div>
      `
    );
  } catch {
    // Non esponiamo errori di invio al chiamante per lo stesso motivo (no enumeration).
  }

  return json(GENERIC_RESPONSE);
});
