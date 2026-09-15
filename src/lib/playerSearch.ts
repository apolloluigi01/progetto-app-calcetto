/**
 * Filtro della ricerca giocatori (elenco Giocatori, CDA → Anagrafica giocatori,
 * CDA → Gestione overall): confronta il testo con nome, cognome, nickname e
 * "nome cognome", senza distinguere maiuscole e minuscole.
 */
export function filterPlayersBySearch<
  T extends { name: string; surname?: string | null; nickname?: string | null },
>(players: T[], search: string): T[] {
  const query = search.trim().toLowerCase()
  if (!query) return players
  return players.filter((p) =>
    [p.name, p.surname ?? '', p.nickname ?? '', `${p.name} ${p.surname ?? ''}`].some((v) =>
      v.toLowerCase().includes(query),
    ),
  )
}
