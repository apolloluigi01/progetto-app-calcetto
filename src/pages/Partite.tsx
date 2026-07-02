import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Match, MatchResult } from '../types/database'

const MAX_PLAYERS = 10

type MatchWithResult = Match & {
  result: MatchResult | null
  pagelle: { published_at: string | null }[]
  match_bookings: { id: string }[]
}

export default function Partite() {
  const { isAdmin } = useAuth()
  const [matches, setMatches] = useState<MatchWithResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('matches')
        .select('*, result:match_results(score_a, score_b, id, match_id), pagelle(published_at), match_bookings(id)')
        .order('match_date', { ascending: false })

      setMatches(
        (data ?? []).map((m) => ({
          ...m,
          result: Array.isArray(m.result) ? m.result[0] ?? null : m.result,
        })) as MatchWithResult[]
      )
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-field-green-dark">Partite</h1>
        {isAdmin && (
          <Link
            to="/partite/nuova"
            className="rounded-lg bg-field-green px-3 py-2 text-sm font-medium text-white hover:bg-field-green-dark"
          >
            Nuova partita
          </Link>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-gray-500">Caricamento...</p>}
        {!loading && matches.length === 0 && (
          <p className="text-sm text-gray-500">Nessuna partita registrata.</p>
        )}
        {matches.map((m) => (
          <Link
            key={m.id}
            to={`/partite/${m.id}`}
            className="block rounded-xl bg-white p-4 shadow hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {new Date(m.match_date).toLocaleDateString('it-IT', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <div className="flex gap-2">
                {m.booking_open && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                    Sondaggio {m.match_bookings.length}/{MAX_PLAYERS}
                  </span>
                )}
                {isAdmin && m.voting_open && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                    Votazioni in corso
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    m.status === 'completed'
                      ? 'bg-field-green/10 text-field-green-dark'
                      : 'bg-field-yellow/20 text-field-orange'
                  }`}
                >
                  {m.status === 'completed' ? 'Completata' : 'In preparazione'}
                </span>
                {m.pagelle.length > 0 && m.pagelle.every((p) => p.published_at) && (
                  <span className="rounded-full bg-field-orange/10 px-2 py-0.5 text-xs text-field-orange">
                    Pubblicata
                  </span>
                )}
              </div>
            </div>
            {m.field && <p className="text-sm text-gray-500">{m.field}</p>}
            {m.result && (
              <p className="mt-1 text-lg font-semibold text-field-green-dark">
                {m.result.score_a} - {m.result.score_b}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
