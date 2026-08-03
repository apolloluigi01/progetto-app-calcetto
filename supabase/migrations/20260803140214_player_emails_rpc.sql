-- Le funzioni di notifica recuperavano l'indirizzo di ogni destinatario con
-- una chiamata separata all'admin API (auth.admin.getUserById dentro un for):
-- con 40 destinatari sono 40 round trip prima ancora di iniziare a spedire.
-- Una sola query, riservata al service_role.
create or replace function player_emails(p_ids uuid[])
returns table (player_id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email::text
  from auth.users u
  where u.id = any(p_ids)
    and u.email is not null;
$$;

revoke execute on function player_emails(uuid[]) from public, anon, authenticated;
grant execute on function player_emails(uuid[]) to service_role;;
