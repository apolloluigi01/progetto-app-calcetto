-- Bucket pubblico per le foto profilo giocatori (usate nella carta giocatore).
-- Lettura pubblica, scrittura riservata agli admin.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_admin());

create policy "avatars_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and public.is_admin())
  with check (bucket_id = 'avatars' and public.is_admin());

create policy "avatars_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.is_admin());
