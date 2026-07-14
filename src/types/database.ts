export type PlayerRole = 'superadmin' | 'admin' | 'player'
export type MatchStatus = 'draft' | 'completed'
export type Team = 'A' | 'B'
export type Fascia = 'A' | 'B' | 'C' | 'D'
export type PlayingPosition = 'POR' | 'DIF' | 'CEN' | 'ATT'

export interface Player {
  id: string
  name: string
  surname: string | null
  nickname: string | null
  avatar_url: string | null
  role: PlayerRole
  nationality: string | null
  position: PlayingPosition | null
  jersey_number: number | null
  must_change_password: boolean
  created_at: string
}

export type SeasonType = 'amichevole' | 'format'

export interface Season {
  id: string
  name: string
  start_date: string
  end_date: string | null
  /** 'format': in stagione si calcola anche la classifica format; 'amichevole': no. */
  season_type: SeasonType
}

export interface Match {
  id: string
  season_id: string
  match_date: string
  match_time: string | null
  field: string | null
  status: MatchStatus
  booking_open: boolean
  voting_open: boolean
  /** Quando l'admin ha ufficializzato le squadre: da lì non si toccano più
   *  e si apre lo schieramento delle formazioni fantacalcetto. */
  teams_official_at: string | null
  created_at: string
}

export interface PlayerVote {
  id: string
  match_id: string
  voter_id: string
  voted_id: string
  vote: number
  created_at: string
}

export interface MatchBooking {
  id: string
  match_id: string
  player_id: string
  created_at: string
}

export interface MatchPlayer {
  id: string
  match_id: string
  player_id: string
  team: Team
}

export interface Goal {
  id: string
  match_id: string
  player_id: string
  team: Team
  is_own_goal: boolean
}

export interface Assist {
  id: string
  match_id: string
  player_id: string
  team: Team
  created_at: string
}

export interface MatchResult {
  id: string
  match_id: string
  score_a: number
  score_b: number
}

export interface Rating {
  id: string
  player_id: string
  rating_value: number
  fascia: Fascia
  updated_at: string
}

export interface RatingWeight {
  id: string
  stat_key: string
  weight_percent: number
}

export type HonorKind = 'format' | 'fanta'

/**
 * Voce dell'albo d'oro censita manualmente dagli admin (stagioni disputate
 * prima dell'app o podio del fantacalcetto).
 */
export interface HonorEntry {
  id: string
  kind: HonorKind
  season_name: string
  end_date: string | null
  first_player_id: string | null
  second_player_id: string | null
  third_player_id: string | null
  created_at: string
}

export interface Pagella {
  id: string
  match_id: string
  player_id: string
  voto: string
  titolo: string | null
  descrizione: string | null
  is_mvp: boolean
  published_at: string | null
}
