-- Il bucket avatars accettava file di qualsiasi tipo e dimensione: i limiti
-- (5 MB, solo immagini) esistevano solo in Impostazioni.tsx e si aggiravano
-- chiamando direttamente l'API di storage. Ora li impone il server.
update storage.buckets
set file_size_limit = 2097152, -- 2 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
where id = 'avatars';

-- Mancava la policy di DELETE: ogni nuovo caricamento lasciava il file
-- precedente nel bucket per sempre. Ognuno puo' cancellare solo dentro la
-- propria cartella (il primo segmento del path e' il proprio user id).
drop policy if exists "avatars_self_delete" on storage.objects;
create policy "avatars_self_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);;
