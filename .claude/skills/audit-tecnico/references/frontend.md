# Frontend ed edge function — cosa cercare

## Edge function: prima di tutto il confronto con il repository

```
mcp: list_edge_functions      → elenco deployato
ls supabase/functions/        → elenco versionato
```

Per ogni function deployata **e non presente nel repository**, scaricane il
codice (`get_edge_function`) e leggilo per intero. Su questo progetto quel
confronto ha prodotto i due rilievi più gravi dell'intero audit:

- una function pubblica (`verify_jwt = false`) che creava un account
  amministratore quando una certa condizione sui dati era vera — condizione che
  poteva tornare vera per un incidente;
- una function che si appoggiava a un vincolo di integrità cancellato mesi prima
  da un'altra migration, e da allora lasciava righe orfane senza che nessuno
  se ne accorgesse.

Poi, su ognuna: `verify_jwt`, controllo del ruolo di chi chiama, CORS (`*` è un
rilievo), limiti di frequenza sulle function pubbliche, uso della chiave di
servizio su percorsi che elaborano input esterni, generazione di credenziali
(`Math.random` non è un generatore crittografico), invio email (una connessione
SMTP per destinatario, in parallelo, è un problema con più destinatari).

## Frontend: i controlli che rendono di più

### Scritture che ignorano l'errore

`scripts/scan-scritture.mjs` conta le chiamate `insert/update/upsert/delete` che
non guardano l'esito. È il controllo che ha prodotto il rilievo più importante
della seconda revisione: 30 scritture su 66, di cui 23 in un solo file, con
sequenze non transazionali che potevano lasciare una partita **senza squadre ma
marcata come ufficializzata**.

Quando ne trovi, distingui:

- **sequenze che devono riuscire o fallire insieme** → funzione Postgres
  transazionale, con controllo del ruolo dentro;
- **singole scritture** → basta leggere l'errore e mostrarlo;
- **operazioni accessorie** (un log, la rimozione di un avviso) → l'errore non va
  mostrato all'utente, ma almeno annotato in console.

### Query che crescono senza limite

`.in('...', [lista])` con una lista che cresce nel tempo: gli id finiscono
nell'URL (36 caratteri l'uno) e oltre qualche centinaio la richiesta sfonda il
limite di lunghezza. Si sostituisce con un filtro su un join:

```ts
supabase.from('goals').select('..., matches!inner(id)').eq('matches.season_id', id)
```

Distingui le liste **limitate** (una stagione, i giocatori di una partita) da
quelle **illimitate** (tutte le partite di sempre): solo le seconde sono rilievi.

### Altro che vale la pena guardare

- **Cache**: senza React Query/SWR ogni navigazione rifà tutte le query. Conta
  quante ne parte la schermata principale.
- **TypeScript strict**: se manca in `tsconfig.app.json`, prova
  `npx tsc -p tsconfig.app.json --strict --noEmit` e conta gli errori. Se sono
  zero, attivarlo è gratis e va detto.
- **Bundle**: `npm run build` e guarda il chunk principale. Un unico file che
  include anche il pannello amministrativo è code splitting mancante.
- **`alert()` / `confirm()` nativi**: bloccano, non si impaginano, e nella PWA
  installata mostrano il dominio.
- **Stati di caricamento**: "Caricamento..." ovunque è un'occasione persa
  rispetto alle sagome.
- **Gestione degli errori nel contesto di autenticazione**: se la lettura del
  profilo fallisce in silenzio si finisce autenticati ma senza profilo, cioè
  senza permessi e senza spiegazione.
- **CSV**: `escapeCell` deve proteggere anche il **primo carattere** (`= + - @`),
  altrimenti Excel esegue la cella come formula — e nomi e soprannomi li
  scrivono gli utenti.
- **Dialoghi propri**: devono gestire `Esc`, confinare il focus e non
  preselezionare il pulsante distruttivo.

## Misure di contorno

Utili nel report per dare le proporzioni: righe di codice, file più grossi
(un file oltre le 1.000 righe concentra i problemi), numero di test, presenza
di una workflow CI, conteggio dei problemi di lint **confrontato con la linea
di base** (`git stash`, lint, `git stash pop`).
