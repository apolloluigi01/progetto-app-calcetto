-- Scadenze del fantacalcetto non piu' cablate nel codice.
--
-- 1) Scadenza iscrizioni: la sceglie l'admin per ogni lega (alla creazione e
--    poi in qualsiasi momento). E' l'ultimo giorno utile, compreso, in ora
--    italiana. Le leghe esistenti ereditano la regola di prima (primo mese
--    dall'inizio della stagione: inizio 1 settembre -> ultimo giorno 30 settembre).
--
-- 2) Blocco formazioni: i minuti prima del calcio d'inizio oltre i quali non si
--    schiera piu' diventano un parametro in fanta_settings (prima 15 fissi).
--    Lo leggono il trigger di blocco, la visibilita' delle formazioni nascoste
--    (fanta_lineups_locked) e la edge function dei reminder.

-- ===== 1) SCADENZA ISCRIZIONI PER LEGA =====
alter table fanta_leagues add column if not exists join_deadline date;

update fanta_leagues l
   set join_deadline = ((s.start_date + interval '1 month')::date - 1)
  from seasons s
 where s.id = l.season_id
   and l.join_deadline is null;

alter table fanta_leagues alter column join_deadline set not null;

create or replace function public.fanta_league_join_open(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from fanta_leagues l
     where l.id = p_league_id
       and (now() at time zone 'Europe/Rome')::date <= l.join_deadline
  );
$$;

-- Finora una lega non si poteva modificare dopo la creazione.
drop policy if exists "fanta_leagues_update_admin" on fanta_leagues;
create policy "fanta_leagues_update_admin" on fanta_leagues for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));

-- ===== 2) BLOCCO FORMAZIONI CONFIGURABILE =====
alter table fanta_settings
  add column if not exists lineup_lock_minutes integer not null default 15
  check (lineup_lock_minutes between 0 and 1440);

create or replace function public.fanta_lineup_lock_minutes()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select lineup_lock_minutes from fanta_settings where id = 1), 15);
$$;

revoke execute on function public.fanta_lineup_lock_minutes() from public, anon;
grant execute on function public.fanta_lineup_lock_minutes() to authenticated;

create or replace function public.fanta_lineup_deadline(p_match_id uuid)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when m.match_time is null then null
    else ((m.match_date + m.match_time) at time zone 'Europe/Rome')
         - make_interval(mins => fanta_lineup_lock_minutes())
  end
  from matches m
  where m.id = p_match_id;
$$;

create or replace function public.check_fanta_lineup_lock()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_match_id uuid;
  v_deadline timestamptz;
begin
  if tg_table_name = 'fanta_lineups' then
    v_match_id := coalesce(new.match_id, old.match_id);
  else
    select l.match_id into v_match_id
    from fanta_lineups l
    where l.id = coalesce(new.lineup_id, old.lineup_id);
  end if;

  if v_match_id is null then
    return coalesce(new, old);
  end if;

  v_deadline := fanta_lineup_deadline(v_match_id);
  if v_deadline is not null and now() >= v_deadline then
    raise exception 'Formazioni bloccate: il termine per schierare (% minuti prima del calcio d''inizio) è scaduto.',
      fanta_lineup_lock_minutes();
  end if;

  return coalesce(new, old);
end;
$$;
