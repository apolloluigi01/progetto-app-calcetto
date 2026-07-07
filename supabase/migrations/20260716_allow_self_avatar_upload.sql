-- Consente a ogni utente di caricare/aggiornare la propria foto profilo
-- (percorso nel bucket "avatars" con prefisso pari al proprio user id).
create policy "avatars_self_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_self_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- RPC security definer per aggiornare solo il proprio avatar_url,
-- sullo stesso modello di update_own_nickname.
create or replace function update_own_avatar(new_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update players set avatar_url = nullif(trim(new_avatar_url), '') where id = auth.uid();
end;
$$;

grant execute on function update_own_avatar(text) to authenticated;
