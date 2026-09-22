# Note di progetto — App Calcetto

Ultimo aggiornamento: 2026-09-22

## Scadenze fanta configurabili e Regolamento (2026-09-22)

- **Scadenza iscrizioni per lega** (`fanta_leagues.join_deadline`, ultimo giorno utile compreso):
  la sceglie l'admin alla creazione (proposta: fine del primo mese di stagione) e la cambia dalla
  pagina della lega. Sostituisce la regola fissa "primo mese" del 2026-09-15; le leghe esistenti
  hanno ereditato quella data. Nuova policy `fanta_leagues_update_admin`: prima una lega non si
  poteva modificare.
- **Blocco formazioni** (`fanta_settings.lineup_lock_minutes`, default 15): si imposta da Gestione
  parametri Fantacalcetto. Lo leggono `fanta_lineup_deadline` (quindi trigger di blocco e
  visibilità delle formazioni nascoste), la pagina formazione e la edge function dei reminder.
  La edge function ora usa `fanta_lineups_locked` del database: prima calcolava il calcio
  d'inizio in UTC e sbagliava di 1-2 ore.
- **Regolamento** (`/regolamento/format|amichevoli|fantacalcetto`): documentazione per tutti.
  Bonus, fasce, crediti e minuti di blocco sono letti dal database, non scritti nel testo:
  cambiando un parametro il regolamento si aggiorna da solo. Le sezioni di partita sono in
  comune tra Format e Amichevoli (`src/pages/regolamento/SezioniPartita.tsx`).
- **Ricerca nel regolamento**: cerca in tutti e tre i regolamenti, titoli e testo, senza
  distinguere maiuscole e accenti. Lavora sul DOM già disegnato (`regolamento/search.ts`):
  nasconde/apre le sezioni ed evidenzia con la CSS Custom Highlight API, che non tocca il DOM
  di React (sui browser che non la supportano la ricerca funziona, senza evidenziazione).
- **Anteprima statistiche nello schieramento** (icona ⓘ, `PlayerInfoPopover`): media voto,
  gol e assist da `useStatistiche`; la **media fantavoto** (voto + bonus/malus, senza
  capitano, sulle partite con voto) si calcola al volo con `fantavotoAverages`, non è salvata.

## Votazioni: tutti o solo admin (2026-09-16)

- Prima di aprire le votazioni l'admin sceglie **chi può votare**: tutti i partecipanti
  oppure solo gli admin che hanno giocato (`matches.voting_admins_only`).
- La applica il database (policy `player_votes_insert`/`_update`); il frontend nasconde il
  box di voto. Resta il bypass del superadmin se nessun admin ha giocato.
- La mail `notify-voting-opened` va a tutti i partecipanti o solo agli admin, secondo la scelta.
- Se si riaprono le votazioni cambiando modalità, i voti già dati restano nelle medie.

## Fantacalcetto: iscrizioni (2026-09-15)

- **Scadenza iscrizioni**: a una lega ci si iscrive solo entro il primo mese dall'inizio
  della stagione collegata (inizio 1 settembre → ultimo giorno 30 settembre, ora italiana).
  La applica il database (policy `fanta_members_insert_self` + funzione
  `fanta_league_join_open`); il frontend (`isJoinOpen` in `lib/fantacalcetto.ts`) nasconde
  solo il pulsante. Vale anche per gli admin.
- **Punti d'ingresso**: chi si iscrive a giornate già calcolate parte dal punteggio più basso
  della classifica generale in quel momento (`computeEntryPoints`). Non è persistito: si
  ricalcola dai punteggi salvati, come il punteggio d'ufficio.

## Audit tecnico del 2026-08-03 — cosa è cambiato

Revisione completa di codice, schema, RLS ed edge function. Interventi applicati
(database di produzione e funzioni già aggiornati):

**Sicurezza**
- La **formazione "invisibile"** del fantacalcetto era rispettata solo dal frontend: le
  policy di SELECT erano `using(true)` e chiunque poteva leggere via API la formazione
  altrui prima del blocco. Ora decide il database: RLS su `fanta_lineup_players` e RPC
  `fanta_match_lineups`, che maschera anche il capitano (vive sulla riga `fanta_lineups`,
  che resta leggibile per punteggio e "ha schierato").
- I **voti individuali** erano leggibili da chiunque. Ora la riga grezza la vedono solo
  l'autore e gli admin; le medie arrivano dalle RPC `match_vote_summary` e
  `match_voter_ids`. L'interfaccia non cambia.
- Il **bucket avatars** non aveva limiti (il tetto di 5 MB e il "solo immagini" stavano
  solo in `Impostazioni.tsx`): ora `file_size_limit` 2 MB e mime type consentiti sul
  bucket, più la policy di DELETE che mancava — ogni caricamento lasciava lì il file
  precedente per sempre.
- **`request-password-reset`** ha un rate limit (3 richieste per indirizzo ogni 15', 10
  per IP ogni ora, tabella `password_reset_attempts`): era pubblica e senza freni, quindi
  si poteva saturare la quota Gmail e bombardare l'indirizzo di un altro.
- **`bootstrap-admin` disattivata** (risponde 410). Era pubblica (`verify_jwt = false`) e
  creava un account admin se non esisteva nessun giocatore con ruolo `admin` — condizione
  che poteva tornare vera per un incidente. Si può eliminare del tutto dalla dashboard.
- CORS ristretto ai domini dell'app su tutte le funzioni (era `*`); la verifica del
  chiamante usa la chiave anonima e non più quella con pieni poteri; password provvisorie
  con `crypto.getRandomValues` al posto di `Math.random`.
- `search_path` fissato sulle funzioni che ne erano prive e `EXECUTE` revocato sulle
  funzioni-trigger, che erano invocabili come RPC perfino da `anon`.

**Correttezza**
- **Cancellazione logica dei giocatori** (`players.deleted_at` + RPC `soft_delete_player`).
  Prima `delete-player` cancellava l'utente auth contando su un cascade da `auth.users` che
  **non esiste più** dalla migration sugli ospiti: la riga restava orfana. E quando il
  cascade funzionava portava via gol, presenze e pagelle, cambiando le statistiche storiche.
  Ora i dati personali spariscono, i dati sportivi restano attribuiti a "Giocatore rimosso".
- La **prossima partita** in Home escludeva solo per data: la sera stessa mostrava ancora
  come "prossima" quella appena giocata.
- Le **statistiche** passavano tutti gli id partita in `.in()`: oltre qualche centinaio di
  partite l'URL sfondava il limite. Ora il filtro è un join su `matches`.
- Le **notifiche email** aprivano una connessione SMTP per destinatario, tutte in parallelo
  (Gmail limita le connessioni contemporanee): ora una sola connessione riusata, e gli
  indirizzi arrivano da una query sola (RPC `player_emails`) invece di una chiamata per
  destinatario.
- `AuthContext` non gestiva l'errore sul caricamento del profilo: si finiva autenticati ma
  senza profilo, in silenzio. Ora riprova e mostra uno stato esplicito.

**Prestazioni e manutenzione**
- **33 chiavi esterne senza indice** (nelle migration non c'era un solo `create index`),
  `auth.uid()` racchiuso in `(select ...)` in 13 policy, policy permissive sovrapposte
  separate per operazione. Gli advisor Supabase su questi tre fronti sono puliti.
- **`strict: true`** su TypeScript: il codice era già conforme, la build resta pulita.
- **Code splitting** per rotta: il bundle iniziale passa da 747 kB (194 kB gzip) a
  277 kB (87 kB gzip), il pannello CDA non viene più scaricato da chi non è admin.
- `confirm()`/`alert()` del browser sostituiti da un dialogo dell'app (`ConfirmDialog`),
  sagome di caricamento al posto di "Caricamento..." nelle pagine più visitate.
- **Drift repo/DB risolto**: le migration applicate a mano non erano nel repository (tra
  cui il trigger `prevent_unauthorized_role_change`, che impedisce le promozioni di ruolo).
  La storia autorevole è la tabella `supabase_migrations.schema_migrations`; si recupera con
  `npx supabase migration fetch --linked`.

### Seconda passata (stesso giorno) — i salvataggi silenziosi

La revisione successiva dell'audit ha trovato il problema più serio là dove la prima
si era fermata: **30 scritture su 66 non controllavano l'esito**. Ora sono 2, entrambe
innocue (registro attività e rimozione di un avviso).

- Le quattro sequenze critiche del pannello partita erano più chiamate indipendenti:
  un errore a metà lasciava il database incoerente. Sono diventate tre funzioni
  Postgres transazionali — `officialize_match_teams`, `save_match_draft_teams`,
  `save_match_result` — che verificano `is_admin()` al loro interno.
  Il caso peggiore era "Ufficializza squadre": cancellava `match_players` e, se il
  reinserimento falliva, la partita restava **senza squadre ma marcata come
  ufficializzata**, con le formazioni fanta comunque azzerate.
- `escapeCell` in `exportCsv.ts` non proteggeva il primo carattere: una cella che
  inizia per `= + - @` viene eseguita come formula da Excel, e il soprannome se lo
  sceglie ogni giocatore. Ora viene anteposto un apostrofo.
- `ConfirmDialog`: `Esc` per annullare, focus confinato nel dialogo e — sulle azioni
  distruttive — focus iniziale su "Annulla" invece che sul pulsante che cancella.
- Il `Suspense` del code splitting avvolgeva tutte le rotte, quindi cambiando pagina
  spariva per un istante anche il menu: ora sta attorno all'`Outlet` dentro il Layout.

### Rimasto fuori, per scelta
- **Multi-gruppo** (più leghe indipendenti nella stessa app): è un progetto a sé, va fatto
  su un branch Supabase. Oggi l'app assume un solo gruppo e il nome è cablato in 16 file.
- Provider email transazionale, dominio proprio, piano Pro (backup PITR e protezione
  password compromesse), Sentry, CI: richiedono account e spese, non solo codice.
- Aggregazione delle statistiche interamente nel database (vista materializzata): il tetto
  è stato tolto, il resto è ottimizzazione che oggi non serve.

## Stato attuale

App pronta per il test con gli amici (lancio beta previsto la settimana del 2026-07-06). Stack: React 19 + Vite + Supabase (progetto `znjiokepokdjzuytkqgm`, piano **Free**), deploy su Vercel, PWA installabile.

Fatto in preparazione al lancio beta:
- Error Boundary globale (`src/components/ErrorBoundary.tsx`) collegato in `main.tsx`.
- Componente `ErrorNotice` riutilizzabile per mostrare errori di fetch con retry.
- Gestione errori aggiunta a: `useHomeDashboard`, `useCurrentSeason`, `Home`, `Partite`, `Giocatori`, `RegistroAttivita`, `Stagioni` (admin), `PartiteAdmin` (admin), `PartitaForm`.
- Verificato: RLS abilitato su tutte le tabelle, build TypeScript pulita.

## Rimandato — da rivalutare in futuro

- **Leaked Password Protection (Supabase Auth)**: non abilitabile perché richiede piano **Pro** (25$/mese) o superiore — sul Free dà errore "available on Pro Plans and up". Non critico (livello WARN, non blocca nulla), da riconsiderare solo se si passa a un piano a pagamento o se l'app cresce oltre l'uso tra amici.
- **Debito di lint pre-esistente**: 18 errori (regola `react-hooks/set-state-in-effect`, cioè `setState` sincrono dentro `useEffect`) sparsi in più file (`AuthContext`, `useMatchBookings`, `useMatchDetail`, `useMatchVoting`, `GiocatoreDetail`, `MatchDetail`, `StatisticaDettaglio`, `GiocatoreEdit`, `GiocatoriAdmin`, `MatchEdit`, `StagioneEdit`, oltre ad alcune pagine toccate nel giro di fix errori). Non bloccano la build (`tsc` passa), solo `npm run lint`. Da sistemare con calma, non urgente.
- **Gestione errori non ancora estesa a**: `MatchEdit`, `StagioneEdit`, `GiocatoriAdmin`, `GiocatoreEdit` (hanno già error handling sui submit, manca solo sui fetch iniziali — rischio basso, sono pagine usate solo dall'admin).
- **Nessun test automatico** (unit/e2e) nel progetto. Da considerare se il codice cresce molto con il fantacalcetto.
- **Bundle Vite > 500kB** (warning in build, non errore). Da valutare code-splitting con `dynamic import()` se il caricamento iniziale rallenta su mobile.

## Prossimo sviluppo: sezione Fantacalcetto (entro settembre 2026)

Stato: **placeholder** — `src/pages/Fantacalcetto.tsx` mostra solo una scritta "Prossimamente", nessuna logica.

Cose da chiarire/progettare prima di partire con l'implementazione:
- Regole del fantacalcetto: come si formano le squadre fantacalcio (asta? draft? liste?), chi può iscriversi, quanti partecipanti.
- Collegamento con il sistema di `overall`/pagelle già esistente (vedi calcolo overall in `src/lib/teamGeneration.ts` e voti/pagelle in `supabase/migrations/20250701_add_voting.sql` e successive) — probabile riuso dei punteggi/pagelle reali dei giocatori come base per i punteggi fantacalcio.
- Nuove tabelle Supabase presumibilmente necessarie: squadre fantacalcio, rose/formazioni schierate a giornata, punteggi fantacalcio per giornata, classifica fantacalcio. Da progettare con RLS coerente con il resto dello schema (vedi `supabase/schema.sql`).
- Considerare se serve una fase di "mercato"/scambi tra amici o è a lista fissa per stagione.

Quando si parte con questa feature, conviene rileggere questo file e lo schema Supabase attuale prima di disegnare le nuove tabelle, per capire cosa è già riusabile (giocatori, stagioni, pagelle, overall) e cosa va costruito da zero.
