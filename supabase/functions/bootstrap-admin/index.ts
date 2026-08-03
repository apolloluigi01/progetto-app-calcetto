import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * DISATTIVATA.
 *
 * Serviva una volta sola, alla nascita del progetto, per creare il primo
 * account admin quando ancora non ne esisteva nessuno. Era esposta senza
 * autenticazione (verify_jwt = false) e la sua unica protezione era una
 * condizione sui dati: "creo un admin solo se non ci sono giocatori con ruolo
 * admin". Una condizione del genere puo' tornare vera per un incidente — per
 * esempio se gli admin venissero rimossi o promossi tutti a superadmin, che
 * quel controllo non contava — e in quel momento chiunque, da internet,
 * potrebbe crearsi un account amministratore.
 *
 * Il progetto e' ormai avviato: nuovi admin si creano da CDA -> Giocatori, con
 * create-player, che verifica chi sta chiamando. Questa funzione resta come
 * segnaposto che rifiuta ogni richiesta; puo' essere eliminata del tutto dalla
 * dashboard Supabase (Edge Functions -> bootstrap-admin -> Delete).
 */
Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: "Funzione disattivata. I nuovi account si creano da CDA → Giocatori.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
