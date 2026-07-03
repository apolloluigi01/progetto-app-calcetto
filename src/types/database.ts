export type PlayerRole = 'superadmin' | 'admin' | 'player'
export type MatchStatus = 'draft' | 'completed'
export type Team = 'A' | 'B'
export type Fascia = 'A' | 'B' | 'C' | 'D'

export interface Player {
  id: string
  name: string
  surname: string | null
  nickname: string | null
  avatar_url: string | null
  role: PlayerRole
  must_change_password: boolean
  created_at: string
}

export interface Season {
  id: string
  name: string
  start_date: string
  end_date: string | null
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
