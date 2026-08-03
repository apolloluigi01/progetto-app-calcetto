-- 1) search_path fissato sulle funzioni che ne erano prive: senza, la
--    risoluzione dei nomi dipende dalla sessione del chiamante.
alter function is_superadmin() set search_path = public;
alter function prevent_unauthorized_role_change() set search_path = public;
alter function match_has_admin_participant(uuid) set search_path = public;
alter function fanta_lineup_deadline(uuid) set search_path = public;
alter function check_fanta_lineup_lock() set search_path = public;
alter function is_admin() set search_path = public;

-- 2) Le funzioni-trigger erano invocabili come RPC via /rest/v1/rpc/, perfino
--    dal ruolo anonimo. Non hanno motivo di essere esposte.
revoke execute on function check_player_auth_user() from public, anon, authenticated;
revoke execute on function enforce_max_bookings() from public, anon, authenticated;
revoke execute on function enforce_max_match_players() from public, anon, authenticated;
revoke execute on function check_fanta_lineup_lock() from public, anon, authenticated;
revoke execute on function prevent_unauthorized_role_change() from public, anon, authenticated;

-- 3) Le funzioni di supporto alle policy non servono al ruolo anonimo.
revoke execute on function is_admin() from anon;
revoke execute on function is_superadmin() from anon;
revoke execute on function match_has_admin_participant(uuid) from anon;
revoke execute on function clear_must_change_password() from anon;
revoke execute on function update_own_nickname(text) from anon;
revoke execute on function update_own_avatar(text) from anon;
revoke execute on function update_own_card(text, text, integer) from anon;

-- 4) Freno sul recupero password: la funzione request-password-reset e'
--    pubblica per necessita' (chi ha perso la password non e' autenticato),
--    ma senza limiti si satura la quota email e si bombarda un indirizzo
--    altrui. Tabella accessibile solo al service_role (nessuna policy).
create table if not exists password_reset_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip text,
  requested_at timestamptz not null default now()
);

alter table password_reset_attempts enable row level security;

create index if not exists idx_password_reset_attempts_email
  on password_reset_attempts (lower(email), requested_at desc);
create index if not exists idx_password_reset_attempts_ip
  on password_reset_attempts (ip, requested_at desc);

comment on table password_reset_attempts is
  'Tentativi di recupero password, per il rate limiting. Nessuna policy RLS: vi accede solo il service_role dalle edge function.';;
