import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
// Nuova secret key (sb_secret_...) con fallback alla legacy service_role.
const serviceRoleKey = Deno.env.get("SERVICE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

// Password iniziale casuale (l'utente ne sceglie una propria al primo accesso).
function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits);
  for (let i = 0; i < 7; i++) pwd += pick(all);
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

function welcomeHtml(name: string, email: string, password: string): string {
  return `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
    <div style="background:#2e7d32;border-radius:12px 12px 0 0;padding:20px 24px;">
      <h2 style="color:white;margin:0;font-size:20px;">⚽ Benvenuto in Pavone League!</h2>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px;">
      <p>Ciao <strong>${name}</strong>,</p>
      <p>Il tuo account è stato creato. Accedi con queste credenziali provvisorie, al primo accesso ti verrà chiesto di scegliere una tua password personale:</p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:20px 0;font-size:14px;">
        <p style="margin:0 0 6px;">Email: <strong>${email}</strong></p>
        <p style="margin:0;">Password provvisoria: <strong>${password}</strong></p>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="${appUrl}/login"
           style="display:inline-block;background:#2e7d32;color:white;padding:14px 32px;
                  border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
          Vai al login
        </a>
      </div>
      <p style="color:#555;font-size:13px;">
        Se il pulsante non è cliccabile, copia questo link e incollalo nel browser:<br>
        <a href="${appUrl}/login" style="color:#2e7d32;word-break:break-all;">${appUrl}/login</a>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        Se non ti aspettavi questo messaggio, puoi ignorarlo.
      </p>
    </div>
  </div>`;
}

async function sendWelcomeEmail(to: string, name: string, password: string): Promise<void> {
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
      subject: "Il tuo account Pavone League",
      content: "text/html",
      html: welcomeHtml(name, to, password),
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
    return json({ error: "Solo un admin puo' registrare un ospite" }, 403);
  }

  const body = await req.json();
  const { guestId, email, password, name, surname, nickname } = body as {
    guestId: string;
    email: string;
    password?: string;
    name: string;
    surname?: string;
    nickname?: string;
  };

  if (!guestId || !email || !name) {
    return json({ error: "guestId, email e name sono obbligatori" }, 400);
  }

  // L'id da convertire deve essere un ospite reale.
  const { data: guest, error: guestError } = await adminClient
    .from("players")
    .select("id, is_guest")
    .eq("id", guestId)
    .single();
  if (guestError || !guest) return json({ error: "Ospite non trovato" }, 404);
  if (!guest.is_guest) return json({ error: "Il giocatore indicato non e' un ospite" }, 400);

  const initialPassword = password && password.length >= 6 ? password : generatePassword();

  // Nessun link di conferma: l'admin ha gia' impostato la password provvisoria,
  // l'utente accede subito e la cambia al primo login (must_change_password).
  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
  });

  if (createError || !createData.user) {
    return json({ error: createError?.message ?? "Errore creazione utente" }, 400);
  }

  // Sposta l'ospite (con tutte le sue statistiche) sul nuovo id auth.
  const { error: convertError } = await adminClient.rpc("register_guest_as_player", {
    p_guest_id: guestId,
    p_new_id: createData.user.id,
    p_name: name,
    p_surname: surname ?? null,
    p_nickname: nickname ?? null,
  });

  if (convertError) {
    // Rollback dell'utente auth: l'ospite resta intatto con le sue statistiche.
    await adminClient.auth.admin.deleteUser(createData.user.id);
    return json({ error: convertError.message }, 400);
  }

  try {
    await sendWelcomeEmail(email, name, initialPassword);
  } catch (e) {
    console.error("Errore invio email:", e);
  }

  return json({ id: createData.user.id });
});
