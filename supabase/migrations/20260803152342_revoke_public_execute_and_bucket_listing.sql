-- Il precedente "revoke ... from anon" non bastava: il permesso di esecuzione
-- sulle funzioni e' concesso di default al ruolo PUBLIC, da cui anon eredita.
-- Va tolto li', e ridato esplicitamente solo a chi serve.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;

-- Funzioni che un utente autenticato deve poter chiamare: quelle usate dalle
-- policy RLS e le RPC "sul proprio profilo" o di lettura aggregata.
grant execute on function is_admin() to authenticated;
grant execute on function is_superadmin() to authenticated;
grant execute on function match_has_admin_participant(uuid) to authenticated;
grant execute on function fanta_lineups_locked(uuid) to authenticated;
grant execute on function fanta_lineup_visible(uuid) to authenticated;
grant execute on function fanta_lineup_deadline(uuid) to authenticated;
grant execute on function fanta_match_lineups(uuid, uuid) to authenticated;
grant execute on function match_vote_summary(uuid) to authenticated;
grant execute on function match_voter_ids(uuid) to authenticated;
grant execute on function clear_must_change_password() to authenticated;
grant execute on function update_own_nickname(text) to authenticated;
grant execute on function update_own_avatar(text) to authenticated;
grant execute on function update_own_card(text, text, integer) to authenticated;

-- Le funzioni riservate alle edge function restano solo al service_role.
grant execute on function soft_delete_player(uuid) to service_role;
grant execute on function player_emails(uuid[]) to service_role;
grant execute on function register_guest_as_player(uuid, uuid, text, text, text) to service_role;

-- Il bucket avatars e' pubblico: gli URL degli oggetti funzionano senza
-- policy di SELECT. Quella policy serviva solo a permettere di ELENCARE tutti
-- i file del bucket, cosa che non serve a nessuno.
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_self_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);;
