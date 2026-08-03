-- Recuperata dalla storia migrazioni del database (era applicata in produzione
-- ma non presente nel repository: ricostruendo il DB dalle sole migration si
-- otteneva uno schema diverso, e senza il trigger che impedisce le promozioni
-- di ruolo non autorizzate).
--
-- Il contenuto riflette quanto realmente eseguito sul progetto; le policy su
-- players sono state poi riscritte da migration successive.

alter table players drop constraint if exists players_role_check;
alter table players add constraint players_role_check check (role in ('admin', 'player', 'superadmin'));

create or replace function is_admin() returns boolean language sql security definer stable as $$
  select exists (select 1 from players where id = auth.uid() and role in ('admin','superadmin'));
$$;

create or replace function is_superadmin() returns boolean language sql security definer stable as $$
  select exists (select 1 from players where id = auth.uid() and role = 'superadmin');
$$;

-- Solo un superadmin puo' cambiare il ruolo di un utente: senza questo trigger
-- basterebbe una policy troppo permissiva per consentire un'autopromozione.
create or replace function prevent_unauthorized_role_change() returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and not is_superadmin() then
    raise exception 'Solo un superadmin puo'' modificare il ruolo di un utente';
  end if;
  return new;
end;
$$;

drop trigger if exists players_role_change_guard on players;
create trigger players_role_change_guard before update on players
  for each row execute function prevent_unauthorized_role_change();
