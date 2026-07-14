-- Quando l'admin salva squadre ricalcolate/modificate/con sostituzione,
-- le formazioni fantacalcetto schierate su quelle squadre vengono azzerate:
-- serve la delete admin sulle lineups (finora solo il proprietario poteva
-- cancellare la propria). fanta_lineup_players segue in cascata.
create policy "fanta_lineups_delete_admin" on fanta_lineups for delete to authenticated using (is_admin());
