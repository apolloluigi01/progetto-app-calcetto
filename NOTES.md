# Note di progetto — App Calcetto

Ultimo aggiornamento: 2026-07-03

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
