import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { logActivity } from '../lib/activityLog'
import type { Season } from '../types/database'

export interface FantaLeague {
  id: string
  season_id: string
  name: string
  season_name: string
}

export default function Fantacalcetto() {
  const { player, isAdmin } = useAuth()

  const [leagues, setLeagues] = useState<FantaLeague[]>([])
  const [myLeagueIds, setMyLeagueIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Creazione lega (solo admin)
  const [showCreate, setShowCreate] = useState(false)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [newName, setNewName] = useState('')
  const [newSeasonId, setNewSeasonId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Unisciti a una lega
  const [showJoin, setShowJoin] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!player) return
    setLoading(true)
    setError(null)

    const [leaguesRes, membersRes] = await Promise.all([
      supabase.from('fanta_leagues').select('id, season_id, name, seasons(name)').order('created_at', { ascending: false }),
      supabase.from('fanta_league_members').select('league_id').eq('player_id', player.id),
    ])

    if (leaguesRes.error) {
      setError(leaguesRes.error.message)
      setLoading(false)
      return
    }

    type Row = { id: string; season_id: string; name: string; seasons: { name: string } | null }
    setLeagues(
      ((leaguesRes.data ?? []) as unknown as Row[]).map((l) => ({
        id: l.id,
        season_id: l.season_id,
        name: l.name,
        season_name: l.seasons?.name ?? '',
      })),
    )
    setMyLeagueIds(new Set((membersRes.data ?? []).map((m) => m.league_id)))
    setLoading(false)
  }, [player])

  useEffect(() => {
    load()
  }, [load])

  async function openCreate() {
    setShowCreate(true)
    setCreateError(null)
    const { data } = await supabase.from('seasons').select('*').order('start_date', { ascending: false })
    setSeasons((data ?? []) as Season[])
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!player || !newName.trim() || !newSeasonId) return
    setCreating(true)
    setCreateError(null)

    const { error: insertError } = await supabase
      .from('fanta_leagues')
      .insert({ season_id: newSeasonId, name: newName.trim(), created_by: player.id })
    setCreating(false)

    if (insertError) {
      if (insertError.code === '23505') {
        setCreateError('Esiste già una lega per questa stagione: scegline un\'altra.')
      } else {
        setCreateError(insertError.message)
      }
      return
    }

    logActivity('fanta_lega_creata', { nome: newName.trim() })
    setNewName('')
    setNewSeasonId('')
    setShowCreate(false)
    load()
  }

  async function handleJoin(leagueId: string) {
    if (!player) return
    setJoining(leagueId)
    const { error: joinError } = await supabase
      .from('fanta_league_members')
      .insert({ league_id: leagueId, player_id: player.id })
    setJoining(null)
    if (joinError && joinError.code !== '23505') {
      setError(joinError.message)
      return
    }
    setShowJoin(false)
    load()
  }

  const myLeagues = leagues.filter((l) => myLeagueIds.has(l.id))
  const joinableLeagues = leagues.filter((l) => !myLeagueIds.has(l.id))

  return (
    <div className="p-4 pb-12">
      <h1
        className="text-2xl font-black uppercase tracking-tight"
        style={{
          background: 'linear-gradient(135deg, #f9a825 0%, #ffe082 50%, #f57f17 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        Fantacalcetto
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Schiera la tua formazione a ogni partita e scala la classifica: tutti contro tutti, vince chi
        totalizza più punti.
      </p>

      {loading && <p className="mt-4 text-sm text-gray-500">Caricamento...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!loading && (
        <>
          {/* Pannello Admin: scorciatoie di gestione del fantacalcetto (solo admin) */}
          {isAdmin && (
            <div className="mt-6 rounded-xl border border-field-orange/30 bg-field-orange/5 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-field-orange">
                Pannello Admin
              </h2>
              <div className="mt-3 space-y-2">
                <Link
                  to="/admin/fantacalcetto"
                  className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-medium shadow-sm hover:bg-gray-50"
                >
                  <span className="text-lg">🎮</span>
                  <div>
                    <p className="font-semibold text-field-green-dark">Gestione bonus Fantacalcetto</p>
                    <p className="text-xs text-gray-500">Parametri bonus e malus del fantacalcetto</p>
                  </div>
                </Link>
                <Link
                  to="/admin/fanta-crediti"
                  className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-medium shadow-sm hover:bg-gray-50"
                >
                  <span className="text-lg">💰</span>
                  <div>
                    <p className="font-semibold text-field-green-dark">Gestione crediti Fantacalcetto</p>
                    <p className="text-xs text-gray-500">Costo in crediti dei giocatori per ogni fascia</p>
                  </div>
                </Link>
              </div>
            </div>
          )}

          {/* Le mie leghe */}
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Le mie leghe</h2>
          <div className="mt-2 space-y-2">
            {myLeagues.length === 0 && (
              <p className="text-sm text-gray-500">Non partecipi ancora a nessuna lega.</p>
            )}
            {myLeagues.map((l) => (
              <Link
                key={l.id}
                to={`/fantacalcetto/${l.id}`}
                className="block rounded-xl bg-white p-4 shadow hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-field-green-dark">{l.name}</p>
                    <p className="text-xs text-gray-500">Stagione {l.season_name}</p>
                  </div>
                  <span className="text-field-orange">→</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Azioni */}
          <div className="mt-4 flex flex-col gap-2">
            {!showJoin ? (
              <button
                onClick={() => setShowJoin(true)}
                className="w-full rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark"
              >
                Unisciti a una lega
              </button>
            ) : (
              <div className="rounded-xl border border-field-green/30 bg-field-green/5 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-field-green-dark">Leghe disponibili</h3>
                  <button onClick={() => setShowJoin(false)} className="text-sm text-gray-500 hover:text-gray-700">
                    Chiudi
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {joinableLeagues.length === 0 && (
                    <p className="text-sm text-gray-600">
                      Al momento non ci sono leghe attive a cui unirsi. Chiedi a un admin di crearne una!
                    </p>
                  )}
                  {joinableLeagues.map((l) => (
                    <div key={l.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                      <div>
                        <p className="text-sm font-medium">{l.name}</p>
                        <p className="text-xs text-gray-500">Stagione {l.season_name}</p>
                      </div>
                      <button
                        onClick={() => handleJoin(l.id)}
                        disabled={joining === l.id}
                        className="rounded-lg bg-field-green px-3 py-1.5 text-xs font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
                      >
                        {joining === l.id ? 'Iscrizione...' : 'Partecipa'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isAdmin && !showCreate && (
              <button
                onClick={openCreate}
                className="w-full rounded-lg border border-field-orange/50 px-4 py-2 text-sm font-medium text-field-orange hover:bg-field-orange/5"
              >
                + Crea una lega (admin)
              </button>
            )}
            {isAdmin && showCreate && (
              <form onSubmit={handleCreate} className="rounded-xl border border-field-orange/30 bg-field-orange/5 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-field-orange">Nuova lega</h3>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Annulla
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nome della lega</label>
                    <input
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Es. FantaPavone 2026/27"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Stagione</label>
                    <select
                      required
                      value={newSeasonId}
                      onChange={(e) => setNewSeasonId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    >
                      <option value="">Seleziona la stagione...</option>
                      {seasons.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {createError && <p className="text-sm text-red-600">{createError}</p>}
                  <button
                    type="submit"
                    disabled={creating || !newName.trim() || !newSeasonId}
                    className="w-full rounded-lg bg-field-orange px-4 py-2 text-sm font-medium text-white hover:bg-field-orange/90 disabled:opacity-60"
                  >
                    {creating ? 'Creazione...' : 'Crea lega'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  )
}
