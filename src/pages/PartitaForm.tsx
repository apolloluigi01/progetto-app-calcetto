import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { findSeasonForDate } from '../lib/seasons'
import { getKnownFields } from '../lib/fields'
import { logActivity } from '../lib/activityLog'
import { computeOverallsForPlayers, generateBalancedTeams } from '../lib/teamGeneration'
import PlayerName from '../components/PlayerName'
import GuestPlayerForm from '../components/GuestPlayerForm'
import type { Player, Team } from '../types/database'
import type { GeneratedTeams } from '../lib/teamGeneration'

type Modalita = 'manuale' | 'sondaggio'

const MAX_PLAYERS = 10

export default function PartitaForm() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState<Player[]>([])
  const [knownFields, setKnownFields] = useState<string[]>([])
  const [matchDate, setMatchDate] = useState('')
  const [matchTime, setMatchTime] = useState('')
  const [field, setField] = useState('')
  const [modalita, setModalita] = useState<Modalita>('sondaggio')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [addingGuest, setAddingGuest] = useState(false)
  const [guestIds, setGuestIds] = useState<Set<string>>(new Set())

  const [generatedTeams, setGeneratedTeams] = useState<GeneratedTeams | null>(null)
  const [generatingTeams, setGeneratingTeams] = useState(false)

  useEffect(() => {
    supabase
      .from('players')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setPlayers((data ?? []) as Player[])
      })
    getKnownFields().then(setKnownFields)
  }, [])

  // Il numero di giocatori per partita è fisso a 10: oltre non si può selezionare.
  function toggleSelected(playerId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        if (next.size >= MAX_PLAYERS) return prev
        next.add(playerId)
      }
      return next
    })
  }

  function handleGuestCreated(guest: Player) {
    setPlayers((prev) => [...prev, guest])
    setGuestIds((prev) => new Set(prev).add(guest.id))
    setSelected((prev) => (prev.size >= MAX_PLAYERS ? prev : new Set(prev).add(guest.id)))
    setAddingGuest(false)
  }

  const selectedIds = Array.from(selected)

  // Le squadre vengono assegnate automaticamente dal sistema in base all'overall dei giocatori scelti.
  useEffect(() => {
    if (modalita !== 'manuale' || selectedIds.length === 0) {
      setGeneratedTeams(null)
      return
    }
    let cancelled = false
    setGeneratingTeams(true)
    const chosen = players.filter((p) => selected.has(p.id))
    computeOverallsForPlayers(chosen.map((p) => ({ id: p.id, name: p.name, surname: p.surname, nickname: p.nickname }))).then((overalls) => {
      if (cancelled) return
      setGeneratedTeams(generateBalancedTeams(overalls))
      setGeneratingTeams(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalita, selected, players])

  // In modalità manuale servono esattamente 10 giocatori, né di più né di meno.
  const canSubmit =
    matchDate &&
    (modalita === 'sondaggio' ||
      (selectedIds.length === MAX_PLAYERS && generatedTeams !== null && !generatingTeams))

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)

    try {
      const season = await findSeasonForDate(matchDate)
      if (!season) {
        throw new Error(
          'Nessuna stagione copre questa data. Crea o estendi una stagione che includa questa data prima di creare la partita.'
        )
      }
      if (season.status === 'conclusa') {
        throw new Error(
          'La stagione che copre questa data è già conclusa: non è possibile aggiungere nuove partite.'
        )
      }
      const seasonId = season.id

      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          season_id: seasonId,
          match_date: matchDate,
          match_time: matchTime || null,
          field: field || null,
          status: 'draft',
          booking_open: modalita === 'sondaggio',
        })
        .select('id')
        .single()

      if (matchError || !match) throw new Error(matchError?.message ?? 'Errore creazione partita')

      if (guestIds.size > 0) {
        await supabase
          .from('players')
          .update({ guest_match_id: match.id })
          .in('id', Array.from(guestIds))
      }

      if (modalita === 'manuale') {
        if (!generatedTeams) throw new Error('Squadre non ancora generate')
        // Le squadre create manualmente entrano come BOZZA: l'admin le
        // approva e ufficializza dalla schermata di gestione partita (stesso
        // flusso della generazione da sondaggio). match_players viene scritto
        // solo all'ufficializzazione.
        const rows = [
          ...generatedTeams.teamA.map((p) => ({ match_id: match.id, player_id: p.playerId, team: 'A' as Team })),
          ...generatedTeams.teamB.map((p) => ({ match_id: match.id, player_id: p.playerId, team: 'B' as Team })),
        ]
        const { error: playersError } = await supabase.from('match_players_draft').insert(rows)
        if (playersError) throw new Error(playersError.message)
        logActivity('partita_creata', { matchId: match.id, data: matchDate, campo: field || null, modalita: 'manuale' })
      } else {
        logActivity('sondaggio_aperto', { matchId: match.id, data: matchDate, campo: field || null })
      }

      navigate(`/partite/${match.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore imprevisto')
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">Nuova Partita</h1>

      <div className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Data</label>
          <input
            type="date"
            required
            value={matchDate}
            onChange={(e) => setMatchDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Ora (opzionale)</label>
          <input
            type="time"
            value={matchTime}
            onChange={(e) => setMatchTime(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Campo (opzionale)</label>
          <input
            value={field}
            onChange={(e) => setField(e.target.value)}
            list="campi-noti"
            placeholder="Es. Centro Sportivo Comunale"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <datalist id="campi-noti">
            {knownFields.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Modalità */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow">
        <h2 className="mb-3 font-medium text-gray-800">Modalità giocatori</h2>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 has-[:checked]:border-field-green has-[:checked]:bg-field-green/5">
            <input
              type="radio"
              name="modalita"
              value="sondaggio"
              checked={modalita === 'sondaggio'}
              onChange={() => setModalita('sondaggio')}
              className="mt-0.5 accent-field-green-dark"
            />
            <div>
              <p className="font-medium text-gray-800">Apri sondaggio</p>
              <p className="text-xs text-gray-500">
                I giocatori si prenotano autonomamente dall'app. Le squadre verranno generate
                automaticamente dall'admin una volta raggiunte le 10 prenotazioni.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 has-[:checked]:border-field-green has-[:checked]:bg-field-green/5">
            <input
              type="radio"
              name="modalita"
              value="manuale"
              checked={modalita === 'manuale'}
              onChange={() => setModalita('manuale')}
              className="mt-0.5 accent-field-green-dark"
            />
            <div>
              <p className="font-medium text-gray-800">Seleziona manualmente</p>
              <p className="text-xs text-gray-500">
                Scegli i 10 giocatori e assegna direttamente le squadre A e B.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Sezione selezione giocatori (solo modalità manuale) */}
      {modalita === 'manuale' && (
        <>
          <div className="mt-4 rounded-xl bg-white p-4 shadow">
            <h2 className="font-medium">
              Giocatori presenti ({selectedIds.length}/{MAX_PLAYERS})
            </h2>
            {selectedIds.length !== MAX_PLAYERS && (
              <p className="mt-1 text-xs text-field-orange">
                Il numero di giocatori è fisso a {MAX_PLAYERS}: selezionane esattamente {MAX_PLAYERS}.
              </p>
            )}
            <div className="mt-2 space-y-1">
              {players.map((p) => {
                const isSelected = selected.has(p.id)
                const disabled = !isSelected && selectedIds.length >= MAX_PLAYERS
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 py-1 ${disabled ? 'opacity-40' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => toggleSelected(p.id)}
                    />
                    <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                    {p.is_guest && (
                      <span className="shrink-0 rounded-full bg-field-orange/10 px-2 py-0.5 text-[10px] font-semibold text-field-orange">
                        Ospite
                      </span>
                    )}
                  </label>
                )
              })}
            </div>

            {!addingGuest ? (
              <button
                type="button"
                onClick={() => setAddingGuest(true)}
                disabled={selectedIds.length >= MAX_PLAYERS}
                className="mt-2 text-sm font-medium text-field-orange hover:underline disabled:opacity-40"
              >
                + Aggiungi ospite
              </button>
            ) : (
              <GuestPlayerForm matchId={null} onCreated={handleGuestCreated} onCancel={() => setAddingGuest(false)} />
            )}
          </div>

          {selectedIds.length > 0 && (
            <div className="mt-4 rounded-xl bg-white p-4 shadow">
              <h2 className="font-medium text-gray-800">Squadre (generate automaticamente)</h2>
              <p className="mt-1 text-xs text-gray-500">
                L'assegnazione è calcolata dal sistema in base all'overall di ciascun giocatore, per
                ottenere squadre il più possibile equilibrate.
              </p>
              {generatingTeams && <p className="mt-3 text-sm text-gray-500">Calcolo squadre...</p>}
              {!generatingTeams && generatedTeams && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-field-green/5 p-3">
                    <p className="text-xs font-semibold text-field-green-dark">
                      Squadra A — Overall {generatedTeams.avgA}
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {generatedTeams.teamA.map((p) => (
                        <li key={p.playerId} className="flex items-center justify-between gap-1">
                          <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                          <span className="shrink-0 text-xs text-gray-500">{p.overall}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-field-orange/5 p-3">
                    <p className="text-xs font-semibold text-field-orange">
                      Squadra B — Overall {generatedTeams.avgB}
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {generatedTeams.teamB.map((p) => (
                        <li key={p.playerId} className="flex items-center justify-between gap-1">
                          <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                          <span className="shrink-0 text-xs text-gray-500">{p.overall}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
        className="mt-4 w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
      >
        {submitting
          ? 'Creazione...'
          : modalita === 'sondaggio'
            ? 'Crea partita e apri sondaggio'
            : 'Crea partita'}
      </button>
    </div>
  )
}
