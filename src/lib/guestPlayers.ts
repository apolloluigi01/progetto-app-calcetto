import { supabase } from './supabase'
import { getFasce, fasciaForOverall } from './fasce'
import type { Player, PlayingPosition } from '../types/database'

export interface CreateGuestPlayerInput {
  name: string
  surname?: string | null
  position?: PlayingPosition | null
  overall: number
  matchId: string | null
}

/**
 * Crea un giocatore ospite: una riga in players (is_guest = true, senza
 * account auth) valida solo per la partita indicata (guest_match_id, cascade
 * alla cancellazione della partita), più il suo overall in ratings. Da quel
 * momento è un player come un altro per generazione squadre, statistiche
 * della singola partita, pagelle, ecc.
 */
export async function createGuestPlayer(input: CreateGuestPlayerInput): Promise<Player> {
  const overall = Math.min(100, Math.max(1, Math.round(input.overall)))

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({
      name: input.name.trim(),
      surname: input.surname?.trim() || null,
      position: input.position || null,
      role: 'player',
      is_guest: true,
      guest_match_id: input.matchId,
      must_change_password: false,
    })
    .select('*')
    .single()
  if (playerError || !player) throw new Error(playerError?.message ?? 'Errore creazione ospite')

  const fasce = await getFasce()
  const { error: ratingError } = await supabase
    .from('ratings')
    .insert({ player_id: player.id, rating_value: overall, fascia: fasciaForOverall(overall, fasce) })
  if (ratingError) {
    await supabase.from('players').delete().eq('id', player.id)
    throw new Error(ratingError.message)
  }

  return player as Player
}
