import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const appUrl = Deno.env.get("APP_URL") ?? "https://progetto-app-calcetto.vercel.app";
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

  // generateLink restituisce anche un codice OTP a 6 cifre (email_otp) abbinato allo
  // stesso token: lo mandiamo via email invece di un link cliccabile, cosi' l'utente
  // lo digita nell'app. Nessun link da rendere cliccabile, nessun rischio che uno
  // scanner antispam lo consumi al posto dell'utente.
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (linkError || !linkData.user || !linkData.properties?.email_otp) {
    // Utente non trovato o altro errore: non lo comunichiamo al chiamante.
    return json(GENERIC_RESPONSE);
  }

  const code = linkData.properties.email_otp;

  try {
    await sendEmail(
      email,
      "Codice per reimpostare la password - Pavone League",
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#2e7d32;">Reimposta la tua password</h2>
          <p>Hai richiesto di reimpostare la password del tuo account su <strong>Pavone League</strong>. Inserisci questo codice nella pagina di reset:</p>
          <p style="text-align:center; margin: 32px 0;">
            <span style="display:inline-block; background:#f3f4f6; color:#1a1a1a; padding:14px 28px; border-radius:8px; font-weight:bold; font-size:28px; letter-spacing:4px;">${code}</span>
          </p>
          <p style="color:#555; font-size:13px;">
            Se il link non è cliccabile, copia questo indirizzo e incollalo nel browser per aprire la pagina di reset:<br>
            <a href="${appUrl}/reset-password" style="color:#2e7d32;word-break:break-all;">${appUrl}/reset-password</a>
          </p>
          <p style="color:#555; font-size:13px;">Il codice scade dopo pochi minuti. Se non hai richiesto tu questa operazione, ignora questa email: la tua password attuale resta valida.</p>
        </div>
      `
    );
  } catch {
    // Non esponiamo errori di invio al chiamante per lo stesso motivo (no enumeration).
  }

  return json(GENERIC_RESPONSE);
});
