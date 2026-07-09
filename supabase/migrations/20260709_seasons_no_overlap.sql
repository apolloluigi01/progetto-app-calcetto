-- Impedisce a livello di database la creazione di stagioni con range di date
-- sovrapposti (end_date nullo = stagione aperta, si estende all'infinito).
create extension if not exists btree_gist;

alter table seasons
  add constraint seasons_no_overlap
  exclude using gist (
    daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&
  );
