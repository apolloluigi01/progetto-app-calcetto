import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMatchDetail } from '../hooks/useMatchDetail'
import { useMatchBookings } from '../hooks/useMatchBookings'
import type { Team } from '../types/database'

const MAX_PLAYERS = 10

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>()
  const { player } = useAuth()
  const { data, loading, error } = useMatchDetail(id)
  const {
    bookings,
    loading: bookingsLoading,
    isBooked,
    refetch: refetchBookings,
  } = useMatchBookings(id, player?.id)

  const [bookingBusy, setBookingBusy] = useState(false)

  async function handleBook() {
    if (!id || !player) return
    setBookingBusy(true)
    await supabase.from('match_bookings').insert({ match_id: id, player_id: player.id })
    setBookingBusy(false)
    refetchBookings()
  }

  async function handleCancel() {
    if (!id || !player) return
    setBookingBusy(true)
    await supabase.from('match_bookings').delete().eq('match_id', id).eq('player_id', player.id)
    setBookingBusy(false)
    refetchBookings()
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !data) return <div className="p-4 text-sm text-red-600">{error ?? 'Partita non trovata'}</div>

  const { match, matchPlayers, goals, result, pagelle } = data
  const teamA = matchPlayers.filter((p) => p.team === 'A')
  const teamB = matchPlayers.filter((p) => p.team === 'B')
  const goalsByTeam = (team: Team) => goals.filter((g) => g.team === team)
  const isPublished = pagelle.length > 0 && pagelle.every((p) => p.published_at)
  const bookingCount = bookings.length
  const bookingFull = bookingCount >= MAX_PLAYERS

  return (
    <div className="p-4 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-field-green-dark">
          {new Date(match.match_date).toLocaleDateString('it-IT', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </h1>
        <div className="flex gap-2">
          {match.booking_open && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              Sondaggio aperto
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              match.status === 'completed'
                ? 'bg-field-green/10 text-field-green-dark'
                : 'bg-field-yellow/20 text-field-orange'
            }`}
          >
            {match.status === 'completed' ? 'Completata' : 'In preparazione'}
          </span>
          {isPublished && (
            <span className="rounded-full bg-field-orange/10 px-2 py-0.5 text-xs text-field-orange">
              Pubblicata
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        {match.match_time && `${match.match_time.slice(0, 5)} · `}
        {match.field || 'Campo non specificato'}
      </p>

      {/* Sezione sondaggio prenotazioni */}
      {match.booking_open && match.status === 'draft' && !bookingsLoading && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-blue-800">Sondaggio partecipazione</h3>
            <span className="text-sm font-bold text-blue-700">
              {bookingCount}/{MAX_PLAYERS}
            </span>
          </div>

          {/* Barra progresso */}
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${Math.min((bookingCount / MAX_PLAYERS) * 100, 100)}%` }}
            />
          </div>

          {/* Lista prenotati */}
          {bookingCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {bookings.map((b) => (
                <span
                  key={b.id}
                  className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-blue-800 shadow-sm"
                >
                  {b.nickname ?? b.name}
                </span>
              ))}
            </div>
          )}

          {/* Bottone prenota / disdici */}
          <div className="mt-3">
            {bookingFull && !isBooked ? (
              <p className="text-center text-sm font-medium text-blue-700">
                Sondaggio al completo — le squadre verranno generate dall'admin.
              </p>
            ) : isBooked ? (
              <button
                onClick={handleCancel}
                disabled={bookingBusy}
                className="w-full rounded-lg border border-blue-400 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {bookingBusy ? 'Aggiornamento...' : '✓ Sei prenotato — Disdici'}
              </button>
            ) : (
              <button
                onClick={handleBook}
                disabled={bookingBusy}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {bookingBusy ? 'Prenotazione...' : 'Prenota il tuo posto'}
              </button>
            )}
          </div>
        </div>
      )}

      {result && (
        <p className="mt-3 text-center text-3xl font-bold text-field-green-dark">
          {result.score_a} - {result.score_b}
        </p>
      )}

      {/* Squadre (visibili solo se i giocatori sono stati assegnati) */}
      {matchPlayers.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-3 shadow">
            <h3 className="mb-2 font-medium text-field-green-dark">Squadra A</h3>
            <ul className="space-y-1 text-sm">
              {teamA.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-white p-3 shadow">
            <h3 className="mb-2 font-medium text-field-green-dark">Squadra B</h3>
            <ul className="space-y-1 text-sm">
              {teamB.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {goals.length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-3 shadow">
          <h3 className="mb-2 font-medium text-field-green-dark">Marcatori</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <ul className="space-y-1">
              {goalsByTeam('A').map((g) => (
                <li key={g.id}>
                  ⚽ {g.name} {g.is_own_goal && <span className="text-red-600">(autogol)</span>}
                </li>
              ))}
            </ul>
            <ul className="space-y-1">
              {goalsByTeam('B').map((g) => (
                <li key={g.id}>
                  ⚽ {g.name} {g.is_own_goal && <span className="text-red-600">(autogol)</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-4">
        <h3 className="mb-2 font-medium text-field-green-dark">Pagelle</h3>
        {pagelle.length === 0 ? (
          <p className="text-sm text-gray-500">Pagelle non ancora pubblicate.</p>
        ) : (
          <div className="space-y-2">
            {pagelle.map((p) => (
              <div key={p.id} className="rounded-xl bg-white p-3 shadow">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {p.name} {p.is_mvp && <span className="text-field-orange">★ MVP</span>}
                  </p>
                  <span className="font-semibold text-field-green-dark">{p.voto}</span>
                </div>
                {p.titolo && <p className="text-sm font-medium text-gray-700">{p.titolo}</p>}
                {p.descrizione && <p className="mt-1 text-sm text-gray-500">{p.descrizione}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
