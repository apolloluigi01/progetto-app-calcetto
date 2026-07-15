-- Costo in crediti fantacalcetto per fascia/carta.
--
-- Prima era implicito (posizione della fascia: 1 credito per la più bassa,
-- 5 per la più alta). Ora è manutenibile dagli admin dalla sezione
-- CDA -> Gestione crediti Fantacalcetto.
alter table fascia_settings add column if not exists credit_cost integer;

-- Seed con i valori impliciti attuali (1..N in ordine di overall crescente).
with ranked as (
  select id, row_number() over (order by min_overall) as pos
  from fascia_settings
)
update fascia_settings f
set credit_cost = r.pos
from ranked r
where f.id = r.id and f.credit_cost is null;

alter table fascia_settings alter column credit_cost set not null;
alter table fascia_settings alter column credit_cost set default 1;
