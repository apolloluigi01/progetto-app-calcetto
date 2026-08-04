# Database — cosa guardare e come

Progetto Supabase di riferimento: `znjiokepokdjzuytkqgm` (App Calcetto).
Gli strumenti sono quelli del connettore Supabase; dove serve la CLI, è già
autenticata e il progetto è collegato.

## 1. Advisor

Punto di partenza obbligato, non punto d'arrivo: gli advisor vedono le
configurazioni, non la logica.

- `get_advisors(type: "security")`
- `get_advisors(type: "performance")`

L'output è lungo: raggruppa per `name` e conta, invece di leggerlo tutto.

Cosa hanno effettivamente segnalato di utile su questo progetto:

| Lint | Significato pratico |
|---|---|
| `unindexed_foreign_keys` | join in scansione completa quando i dati crescono |
| `auth_rls_initplan` | `auth.uid()` rivalutato riga per riga: va racchiuso in `(select auth.uid())` |
| `multiple_permissive_policies` | più policy valutate per la stessa operazione |
| `anon_security_definer_function_executable` | funzione potente invocabile **senza login** |
| `function_search_path_mutable` | risoluzione dei nomi dipendente dalla sessione |
| `public_bucket_allows_listing` | si può elencare tutto il contenuto del bucket |
| `auth_leaked_password_protection` | richiede il piano Pro, non risolvibile a codice |

Voluti e da non "correggere": `extension_in_public` per `btree_gist`,
`rls_enabled_no_policy` su `password_reset_attempts` (ci accede solo il
service role), le funzioni eseguibili da utenti autenticati che *devono* esserlo.

## 2. Copertura e contenuto delle policy

```sql
select c.relname as tabella,
       c.reltuples::bigint as righe_stimate,
       pg_size_pretty(pg_total_relation_size(c.oid)) as dimensione,
       c.relrowsecurity as rls,
       (select count(*) from pg_policies p
         where p.tablename = c.relname and p.schemaname = 'public') as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
```

Poi **leggi le policy**, non solo contarle:

```sql
select tablename, policyname, cmd,
       coalesce(qual, '-') as using_expr,
       coalesce(with_check, '-') as check_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Domanda da porsi su ogni `using (true)`: *questa tabella contiene qualcosa che
un partecipante non dovrebbe vedere di un altro?* È così che sono emersi i voti
individuali leggibili da chiunque e le formazioni "nascoste" che non lo erano.

Attenzione al caso subdolo: una regola applicata **solo dal frontend**. Se
l'interfaccia nasconde qualcosa ma la policy dice `true`, la regola non esiste.

## 3. Privilegi di esecuzione

Revocare da `anon` **non basta**: il permesso è concesso a `PUBLIC`, da cui
`anon` eredita. Verifica sempre il risultato reale:

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as autenticato,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by anon desc, p.proname;
```

Le funzioni-trigger (`enforce_*`, `check_*`) non devono essere invocabili da
nessuno via `/rest/v1/rpc/`.

## 4. Storage

```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
select policyname, cmd, qual, with_check
from pg_policies where schemaname = 'storage' and tablename = 'objects';
```

`file_size_limit` e `allowed_mime_types` a `null` su un bucket pubblico
significano: chiunque sia autenticato può caricare file di qualunque tipo e
dimensione e ottenere un URL pubblico sul dominio dell'app. I controlli scritti
nel frontend non contano.

Su un bucket **pubblico** gli URL degli oggetti funzionano senza policy di
SELECT: quella policy serve solo a poter *elencare* i file. Se la togli,
verifica comunque che un'immagine esistente risponda ancora `200`.

## 5. Drift fra repository e database

La storia autorevole è la tabella `supabase_migrations.schema_migrations`.

```
mcp: list_migrations
```

Confrontala con `supabase/migrations/`. Per portare nel repository quelle che
mancano, senza incollarle a mano:

```bash
# `migration fetch` fallisce se supabase/migrations esiste già: si lavora in
# una cartella temporanea che contiene solo supabase/.temp (il collegamento al
# progetto), poi si copiano i file che servono.
TMP=/percorso/temporaneo
mkdir -p "$TMP/supabase" && cp -r <progetto>/supabase/.temp "$TMP/supabase/"
npx --yes supabase@latest migration fetch --linked --workdir "$TMP"
cp "$TMP/supabase/migrations/<versione>_<nome>.sql" <progetto>/supabase/migrations/
```

I file recuperati conservano i commenti originali: sono fedeli, non ricostruiti.

Nota: alcune migration del repository **non** esistono nella storia del database
(applicate a mano dal SQL editor). Non cancellarle: aggiungi quelle mancanti,
non sostituire la cartella.

## 6. Volumi

`reltuples` dà l'ordine di grandezza. Serve a calibrare i rilievi: un problema
che si manifesta oltre le migliaia di righe, su una tabella che ne ha 40, è un
rilievo di prospettiva — dillo, non spacciarlo per urgente.
