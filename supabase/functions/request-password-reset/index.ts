import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
// Nuova secret key (sb_secret_...) con fallback alla legacy service_role.
const serviceRoleKey = Deno.env.get("SERVICE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const appUrl = Deno.env.get("APP_URL") ?? "https://progetto-app-calcetto.vercel.app";
const gmailUser = Deno.env.get("GMAIL_USER")!;
const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD")!;

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

/** Massimo di richieste per lo stesso indirizzo, e finestra in minuti. */
const MAX_PER_EMAIL = 3;
const EMAIL_WINDOW_MINUTES = 15;
/** Massimo di richieste dallo stesso IP, e finestra in minuti. */
const MAX_PER_IP = 10;
const IP_WINDOW_MINUTES = 60;

// Risposta pubblica intenzionalmente generica: non deve rivelare se un'email esiste o no.
const GENERIC_RESPONSE = {
  message: "Se l'indirizzo esiste, riceverai una mail con le istruzioni per reimpostare la password.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  // Un corpo non JSON faceva esplodere la funzione con un 500 senza header CORS.
  let email: string | undefined;
  try {
    ({ email } = (await req.json()) as { email?: string });
  } catch {
    return json(req, { error: "Richiesta non valida" }, 400);
  }
  if (!email || !email.trim()) {
    return json(req, { error: "email obbligatoria" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Freno anti abuso. La funzione e' pubblica per necessita' (chi ha perso la
  // password non e' autenticato): senza limiti si satura la quota di invio
  // giornaliera — condivisa con tutte le altre notifiche dell'app — e si puo'
  // bombardare di email l'indirizzo di un altro.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const normalizedEmail = email.trim().toLowerCase();

  const { count: emailCount } = await adminClient
    .from("password_reset_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email", normalizedEmail)
    .gte("requested_at", new Date(Date.now() - EMAIL_WINDOW_MINUTES * 60_000).toISOString());

  if ((emailCount ?? 0) >= MAX_PER_EMAIL) {
    return json(req, { error: "Troppe richieste per questo indirizzo. Riprova tra un quarto d'ora." }, 429);
  }

  if (ip) {
    const { count: ipCount } = await adminClient
      .from("password_reset_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("requested_at", new Date(Date.now() - IP_WINDOW_MINUTES * 60_000).toISOString());

    if ((ipCount ?? 0) >= MAX_PER_IP) {
      return json(req, { error: "Troppe richieste. Riprova piu' tardi." }, 429);
    }
  }

  // Il tentativo si registra PRIMA dell'invio, cosi' conta anche quando
  // l'indirizzo non esiste: altrimenti il limite sarebbe aggirabile.
  await adminClient.from("password_reset_attempts").insert({ email: normalizedEmail, ip });
  await adminClient
    .from("password_reset_attempts")
    .delete()
    .lt("requested_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());

  // generateLink restituisce anche un codice OTP (email_otp) abbinato allo stesso
  // token: lo mandiamo via email invece di un link cliccabile, cosi' l'utente lo
  // digita nell'app. Nessun link da rendere cliccabile, nessun rischio che uno
  // scanner antispam lo consumi al posto dell'utente. La lunghezza del codice la
  // decide l'impostazione "Email OTP Length" del progetto Supabase (oggi 8 cifre):
  // non va data per scontata ne' qui ne' nel campo di input dell'app.
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: normalizedEmail,
  });

  if (linkError || !linkData.user || !linkData.properties?.email_otp) {
    // Utente non trovato o altro errore: non lo comunichiamo al chiamante.
    return json(req, GENERIC_RESPONSE);
  }

  const code = linkData.properties.email_otp;

  try {
    await sendEmail(
      normalizedEmail,
      "Codice per reimpostare la password - Pavone League",
      `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#2e7d32;">Reimposta la tua password</h2>
          <p>Hai richiesto di reimpostare la password del tuo account su <strong>Pavone League</strong>. Inserisci questo codice nella pagina di reset:</p>
          <p style="text-align:center; margin: 32px 0;">
            <span style="display:inline-block; background:#f3f4f6; color:#1a1a1a; padding:14px 28px; border-radius:8px; font-weight:bold; font-size:28px; letter-spacing:4px;">${code}</span>
          </p>
          <p style="color:#555; font-size:13px;">
            Inserisci il codice per intero (${code.length} cifre) in questa pagina:<br>
            <a href="${appUrl}/reset-password" style="color:#2e7d32;word-break:break-all;">${appUrl}/reset-password</a>
          </p>
          <p style="color:#555; font-size:13px;">Il codice scade dopo pochi minuti. Se non hai richiesto tu questa operazione, ignora questa email: la tua password attuale resta valida.</p>
        </div>
      `
    );
  } catch {
    // Non esponiamo errori di invio al chiamante per lo stesso motivo (no enumeration).
  }

  return json(req, GENERIC_RESPONSE);
});
