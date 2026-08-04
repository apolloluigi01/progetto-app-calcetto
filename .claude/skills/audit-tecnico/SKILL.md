---
name: audit-tecnico
description: Audit tecnico completo di un'app React + Vite + Supabase deployata su Vercel — sicurezza, correttezza, prestazioni, UX e prontezza a un pubblico più ampio. Usala quando l'utente chiede un'analisi/audit/revisione dell'app, "cosa si può migliorare", "ci sono bug", "è pronta per più utenti", oppure prima di aprire l'app a persone esterne al gruppo. Non usarla per rivedere una singola modifica o un diff: per quello serve una code review.
---

# Audit tecnico

Analisi a tutto campo di un'app React + Supabase viva. L'obiettivo non è produrre
una lista di buone pratiche: è trovare **i problemi che si manifesteranno davvero**,
dimostrarli, e ordinarli per impatto.

## Il principio che regge tutto

> **Il repository non è la verità. Il progetto in produzione è la verità.**

Le due falle più gravi mai trovate su questo progetto non erano nel codice del
repository: una edge function pubblica che poteva creare un account amministratore,
e un `delete-player` che si appoggiava a un vincolo cancellato mesi prima. Chi
avesse letto solo i file versionati non le avrebbe viste.

Da qui discendono tre regole non negoziabili:

1. **Confronta sempre deployato e versionato** — edge function e migration.
2. **Non affermare niente che non hai verificato.** Una policy "sembra giusta"
   finché non la provi impersonando un utente vero.
3. **Distingui il difetto dall'opinione.** Se non sai descrivere lo scenario
   concreto in cui qualcosa si rompe, non è un rilievo: è un gusto personale.

## Procedimento

Le fasi si eseguono in ordine. Le prime tre raccolgono, la quarta verifica, la
quinta comunica.

### Fase 1 — Inventario

Fotografa la dimensione del problema prima di entrarci: righe di codice, pagine,
hook, migration, edge function, presenza di test e di CI, dimensione del bundle.
Servono a dare il senso delle proporzioni nel report e a misurare i progressi
alla revisione successiva.

Leggi anche `NOTES.md` se esiste: contiene le decisioni già prese e le cose
volutamente rimandate. Ripresentarle come scoperte fa perdere credibilità al
resto.

### Fase 2 — Database

Vedi `references/database.md` per i comandi esatti. In sintesi:

- advisor Supabase di **sicurezza** e **prestazioni** (sono il punto di partenza,
  non l'arrivo);
- copertura RLS tabella per tabella, e **lettura delle policy**: `using (true)`
  su una tabella che contiene dati personali o competitivi è quasi sempre un
  rilievo;
- privilegi `EXECUTE` sulle funzioni — attenzione: revocare da `anon` non basta,
  il permesso arriva da `PUBLIC`;
- configurazione dei bucket storage (limiti di dimensione e tipo);
- **drift**: migration presenti nel database ma assenti dal repository;
- volumi reali delle tabelle, per capire cosa reggerà e cosa no.

### Fase 3 — Edge function e frontend

- **Elenca le function deployate e confrontale con la cartella del repository.**
  Per ognuna che manca, scaricane il codice e leggilo: è lì che si nascondono le
  cose dimenticate. Controlla `verify_jwt`, i controlli di ruolo, il CORS, i
  limiti di frequenza e come vengono spedite le email.
- Frontend: vedi `references/frontend.md`. I controlli che hanno prodotto i
  rilievi più utili sono le **scritture che ignorano l'errore**
  (`scripts/scan-scritture.mjs`), le query che crescono senza limite, l'assenza
  di cache, la modalità strict di TypeScript e la dimensione del bundle.

### Fase 4 — Verifica (la fase che rende l'audit affidabile)

Ogni rilievo importante va **dimostrato** prima di finire nel report. Le tecniche
sono in `references/verifiche.md`:

- impersonare un utente normale e un admin dentro `begin … rollback`, e
  confrontare cosa vedono;
- provare le API con `curl` (rate limit, CORS, accessi pubblici);
- verificare l'equivalenza quando riscrivi una query, contando le righe prima e dopo;
- misurare il layout con Playwright quando il rilievo è visivo.

Se una verifica smentisce l'ipotesi, il rilievo si scarta o si riscrive. È
successo: l'invio email risultava "sequenziale" alla lettura, ma il codice usava
`Promise.allSettled` — il problema era un altro (connessioni contemporanee).

### Fase 5 — Report

Vedi `references/report.md` per la struttura, la scala di gravità e lo stile.
In breve: ogni voce dice **cosa si rompe, in quale scenario, e come si chiude**.
Alla fine, sempre, cosa hai lasciato fuori e perché.

## Se ti chiedono di applicare i fix

Non partire senza aver chiarito due cose: **il perimetro** (tutti i fix tecnici?
solo i critici? anche i cambiamenti architetturali?) e **se puoi toccare il
database di produzione** o devi limitarti a preparare le migration.

Poi, mentre lavori:

- una migration per argomento, applicata e **verificata** subito, non tutte insieme;
- le sequenze di scritture che devono riuscire o fallire insieme diventano
  funzioni Postgres transazionali, con il controllo del ruolo al loro interno;
- dopo ogni modifica alle RLS, ricontrolla che l'app funzioni ancora per un
  utente normale: è facilissimo chiudere una falla e insieme rompere una pagina;
- riporta nel repository le migration applicate (vedi il drift in
  `references/database.md`) e aggiorna `NOTES.md`.

## Errori da non ripetere

- **Non fidarti del conteggio dei lint senza una linea di base.** Misura prima
  (`git stash` + lint) e dopo, altrimenti non sai se hai aggiunto debito.
- **I file del repository hanno fine riga CRLF.** Gli script di sostituzione che
  cercano `\n` non trovano niente: normalizza in lettura e ripristina in scrittura.
- **Mai backtick dentro `node -e "…"` nella shell**: vengono eseguiti come
  comandi e le stringhe arrivano vuote. Scrivi lo script su file.
- **Non spostare `btree_gist`** dallo schema public: regge il vincolo di non
  sovrapposizione delle stagioni.
- Quando crei una tabella temporanea e poi cambi ruolo con `set local role
  authenticated`, ricordati `grant select` sulla temporanea, altrimenti la query
  fallisce per permessi.
