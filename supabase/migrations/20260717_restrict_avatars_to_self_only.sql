-- La foto profilo si carica solo dalla propria pagina Impostazioni: nessun
-- utente, admin compreso, può scrivere la foto di un altro giocatore.
-- Restano solo le policy "self" (percorso = proprio user id) e la lettura
-- pubblica.
drop policy if exists "avatars_admin_insert" on storage.objects;
drop policy if exists "avatars_admin_update" on storage.objects;
drop policy if exists "avatars_admin_delete" on storage.objects;
