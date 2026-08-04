# Verifiche — come dimostrare un rilievo

Un audit vale quanto le sue prove. Queste tecniche sono tutte già state usate
con successo su questo progetto.

## Impersonare un utente dentro una transazione annullata

È lo strumento più potente: mostra cosa vede davvero un utente, RLS comprese,
senza toccare i dati.

```sql
begin;
-- Il contesto si prepara PRIMA di cambiare ruolo (da postgres si vede tutto).
create temp table ctx as
select (select id from players where role = 'player'
          and not is_guest and deleted_at is null limit 1) as player_id,
       (select id from matches limit 1) as match_id;
-- Indispensabile: dopo il cambio di ruolo la temporanea non sarebbe leggibile.
grant select on ctx to authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', (select player_id from ctx), 'role', 'authenticated')::text,
  true);
set local role authenticated;

select
  (select count(*) from player_votes)        as voti_visibili,
  (select count(*) from fanta_lineup_players) as formazioni_visibili;
rollback;
```

Accortezze imparate sul campo:

- **Prepara i parametri prima del cambio ruolo.** Se prendi un id con una
  sottoquery *dopo*, le RLS possono renderlo `null` e la prova non dimostra
  niente (una RPC che riceve `null` restituisce zero righe, e sembra un bug).
- **Ripeti la stessa prova come admin**: chiudere una falla senza accorgersi di
  aver rotto una funzione per gli amministratori è l'errore più comune.
- Puoi anche **simulare uno stato** dentro la transazione (nascondere una
  formazione, spostare la data di una partita, riempire una bozza oltre il
  limite) e poi annullare tutto: è così che si prova un caso limite senza
  creare dati finti in produzione.

### Provare che un'operazione è davvero atomica

```sql
begin;
create temp table before_state as
select player_id, team from match_players where match_id = <id>;
grant select on before_state to authenticated;

-- … si crea la condizione che deve far fallire l'operazione …

do $$
begin
  perform operazione_da_provare(<id>);
  raise notice 'ATTENZIONE: non ha sollevato errore';
exception when others then
  null; -- errore atteso
end $$;

select (select count(*) = 0 from (
   select player_id, team from match_players where match_id = <id>
   except select player_id, team from before_state) d) as identiche_a_prima;
rollback;
```

Se `identiche_a_prima` è `true`, il fallimento non ha lasciato traccia.

### Provare che i permessi reggono

Impersona un utente **non** autorizzato e raccogli gli esiti invece di
interrompere alla prima eccezione:

```sql
create temp table esiti (funzione text, esito text);
do $$
begin
  begin
    perform funzione_riservata(<id>);
    insert into esiti values ('funzione_riservata', 'PERMESSA (male!)');
  exception when others then
    insert into esiti values ('funzione_riservata', 'respinta: ' || sqlerrm);
  end;
end $$;
select * from esiti;
```

## Provare le API dall'esterno

Chiave anonima e URL si leggono da `.env.local`.

```bash
URL=$(grep VITE_SUPABASE_URL .env.local | cut -d= -f2 | tr -d '\r')
KEY=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d= -f2 | tr -d '\r')

# Una funzione che deve rifiutare
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$URL/functions/v1/<nome>" \
  -H "Content-Type: application/json" -d '{}'

# CORS: l'origine legittima viene rimandata indietro, quella estranea no
curl -s -D - -o /dev/null -X OPTIONS "$URL/functions/v1/<nome>" \
  -H "Origin: https://sito-estraneo.example" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin

# Rate limit: la richiesta oltre la soglia deve rispondere 429
for i in 1 2 3 4; do
  curl -s -X POST "$URL/functions/v1/<nome>" -H "Authorization: Bearer $KEY" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d '{"email":"indirizzo-inesistente@example.invalid"}' | head -c 120; echo
done
```

Usa sempre indirizzi `@example.invalid` per non spedire email a persone vere, e
**ripulisci** le righe di prova che restano nelle tabelle di appoggio.

Per la sintassi di una query PostgREST riscritta basta il codice di stato: un
`200` conferma che l'espressione è valida anche se le RLS restituiscono zero
righe a un client anonimo.

## Provare che una riscrittura non cambia i risultati

Quando sostituisci il modo di filtrare (per esempio una lista di id con un join),
conta le righe nei due modi e confrontale:

```sql
select
  (select count(*) from goals g join matches m on m.id = g.match_id
     where m.season_id = <id>)                                   as con_join,
  (select count(*) from goals g
     where g.match_id in (select id from matches where season_id = <id>)) as con_lista;
```

Scegli una stagione che **contiene** dati: su una vuota tutti i confronti danno
zero e non dimostrano nulla.

## Misurare il layout senza login

Playwright è disponibile (`npx playwright`, Chromium già installato). Per i
problemi di larghezza non serve autenticarsi: basta il CSS della build e il
markup del componente.

```js
import { chromium } from 'playwright'
// CSS reale della build: dist/assets/index-*.css, iniettato in <style>
// markup: classi copiate dal componente
const ctx = await browser.newContext({ viewport: { width: 360, height: 700 } })
await page.setContent(html)
const r = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  viewport: window.innerWidth,
}))
// doc > viewport ⇒ la pagina sfora: è l'effetto che l'utente chiama "zoomata"
```

Ricostruisci la build **dopo** aver aggiunto classi nuove, altrimenti Tailwind
non le ha generate e la misura è falsa.
