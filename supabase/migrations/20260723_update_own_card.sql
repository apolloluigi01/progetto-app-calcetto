-- Ogni utente può aggiornare i dati della propria carta giocatore
-- (nazionalità, ruolo di gioco, numero di maglia), sullo stesso modello
-- di update_own_nickname / update_own_avatar: RLS su players consente
-- l'update solo agli admin, quindi si passa da una RPC security definer
-- limitata a queste tre colonne, sulla propria riga.
create or replace function update_own_card(
  new_nationality text,
  new_position text,
  new_jersey_number integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_position is not null and new_position not in ('POR', 'DIF', 'CEN', 'ATT') then
    raise exception 'Ruolo di gioco non valido';
  end if;
  if new_jersey_number is not null and (new_jersey_number < 1 or new_jersey_number > 99) then
    raise exception 'Il numero di maglia deve essere compreso tra 1 e 99';
  end if;

  update players
  set nationality = nullif(trim(new_nationality), ''),
      position = nullif(trim(new_position), ''),
      jersey_number = new_jersey_number
  where id = auth.uid();
end;
$$;

grant execute on function update_own_card(text, text, integer) to authenticated;
