-- Aggiunge lo stato di conferma dell'indirizzo, cosi' list-players puo'
-- continuare a esporre email_confirmed con lo stesso significato di prima.
drop function if exists player_emails(uuid[]);

create or replace function player_emails(p_ids uuid[])
returns table (player_id uuid, email text, email_confirmed boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email::text, u.email_confirmed_at is not null
  from auth.users u
  where u.id = any(p_ids)
    and u.email is not null;
$$;

revoke execute on function player_emails(uuid[]) from public, anon, authenticated;
grant execute on function player_emails(uuid[]) to service_role;;
