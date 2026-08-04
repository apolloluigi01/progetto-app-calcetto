# Report — struttura, gravità, stile

## Gravità

Tre livelli, assegnati per **impatto**, non per difficoltà di correzione.

- **P1** — dati esposti a chi non dovrebbe vederli, privilegi ottenibili
  indebitamente, perdita o alterazione di dati, un canale che si può saturare
  dall'esterno. Si correggono subito.
- **P2** — l'app fa una cosa sbagliata in uno scenario reale ma circoscritto,
  oppure un limite che si manifesterà con la crescita. Vanno in coda.
- **P3** — attriti, codice morto, cose che si sentiranno solo con molti più
  utenti.

Se non riesci a scrivere lo scenario concreto in cui qualcosa si rompe, non è
un rilievo. Toglilo.

## Anatomia di un rilievo

Tre parti, sempre nell'ordine:

1. **Cosa non va**, con il riferimento preciso al file o alla policy.
2. **Quando si manifesta** — lo scenario concreto. Non "potrebbe essere
   insicuro", ma "chi apre gli strumenti sviluppatore vede le formazioni degli
   altri prima del blocco".
3. **Come si chiude**, con l'ordine di grandezza dell'intervento.

Esempio della differenza:

> ❌ Le policy RLS su `fanta_lineups` sono troppo permissive.
>
> ✅ Il flag `hidden` è rispettato solo dall'interfaccia: le policy di SELECT
> sono `using (true)`, quindi qualsiasi utente loggato può leggere via API la
> formazione di chiunque prima del blocco. Chi sa aprire gli strumenti
> sviluppatore gioca con le carte scoperte.

## Struttura del documento

1. **Verdetto** — due o tre frasi oneste. Se l'esecuzione è buona e il problema
   sono le assunzioni, dillo.
2. **Numeri** — poche misure che danno le proporzioni.
3. **Bug e correttezza**, per gravità decrescente.
4. **Esperienza d'uso** — in tabella, con l'impegno stimato.
5. **Da gruppo a prodotto** — cosa cambia strutturalmente per un pubblico ampio.
6. **Infrastruttura** — database, sicurezza, email, dominio, costi indicativi.
7. **Come procederei** — fasi numerate, perché qui l'ordine conta davvero.
8. **Cosa non rifarei** — le scelte di fondo che sono giuste e vanno lasciate
   stare. Un audit che critica tutto non è credibile.

### Alla seconda revisione

Apri con una tabella **prima/ora** e la colonna "come l'ho verificato": è la
parte che rende il documento verificabile invece che affermativo. Poi il nuovo
problema principale, e infine le non-regressioni (le cose note ancora aperte),
perché ometterle darebbe l'impressione sbagliata di un'app finita.

## Forma

Il report va pubblicato come Artifact (carica prima la skill `artifact-design`).
Aggiornando lo stesso file si mantiene l'indirizzo e la revisione precedente
resta nella cronologia delle versioni.

Nel messaggio in chat non ripetere il documento: dai il collegamento, i tre o
quattro fatti che contano davvero con i numeri, e chiudi con la domanda su cosa
fare. La tabella prima/dopo funziona bene anche in chat.

## Tono

- In italiano, senza gergo inutile: "la pagina diventa più larga dello schermo"
  batte "overflow orizzontale del layout viewport".
- Riporta le cose come stanno: se una verifica non l'hai potuta fare, scrivilo
  invece di lasciarlo intendere.
- Se un difetto è in qualcosa che hai scritto tu in una sessione precedente,
  dillo con la stessa chiarezza degli altri. Un audit che si autoassolve non
  serve a niente.
