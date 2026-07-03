import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getFunctionErrorMessage } from '../../lib/functionErrors'
import { logActivity } from '../../lib/activityLog'
import type { Player, PlayerRole } from '../../types/database'

type PlayerWithStatus = Player & { email?: string | null; email_confirmed?: boolean }

const roleLabels: Record<PlayerRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  player: 'Player',
}

export default function GiocatoriAdmin() {
  const { isSuperAdmin } = useAuth()
  const [players, setPlayers] = useState<PlayerWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<PlayerRole>('player')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function loadPlayers() {
    setLoading(true)
    const { data, error } = await supabase.functions.invoke<{ players: PlayerWithStatus[] }>('list-players')
    if (error) setError(error.message)
    setPlayers(data?.players ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadPlayers()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    const { error: fnError } = await supabase.functions.invoke<{ id: string }>('create-player', {
      body: { email, password, name, surname: surname || undefined, nickname: nickname || undefined, role },
    })

    setSubmitting(false)

    if (fnError) {
      setError(await getFunctionErrorMessage(fnError, 'Errore nella creazione del giocatore'))
      return
    }

    setSuccess(`Giocatore creato. Puo' accedere subito con l'email ${email} e la password impostata.`)
    logActivity('giocatore_creato', { nome: name, email, ruolo: role })
    setName('')
    setSurname('')
    setNickname('')
    setEmail('')
    setPassword('')
    setRole('player')
    setShowForm(false)
    loadPlayers()
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-field-green-dark">Anagrafica giocatori</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-field-green px-3 py-2 text-sm font-medium text-white hover:bg-field-green-dark"
          >
            Inserisci giocatore
          </button>
        )}
      </div>

      {error && !showForm && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && !showForm && <p className="mt-4 text-sm text-field-green-dark">{success}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Nuovo giocatore</h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Annulla
            </button>
          </div>
          <input
            placeholder="Nome"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <input
            placeholder="Cognome"
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <input
            placeholder="Nickname (opzionale)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <input
            placeholder="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <input
            placeholder="Password iniziale"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          {isSuperAdmin && (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as PlayerRole)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="player">Player</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-field-green-dark">{success}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
          >
            {submitting ? 'Creazione...' : 'Crea giocatore'}
          </button>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-gray-500">Caricamento...</p>}
        {players.map((p) => (
          <Link
            key={p.id}
            to={`/admin/giocatori/${p.id}`}
            className="block rounded-xl bg-white p-3 shadow hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {p.name}
                  {p.surname && ` ${p.surname}`}
                </p>
                {p.nickname && <p className="text-xs text-gray-500">{p.nickname}</p>}
              </div>
              <div className="flex items-center gap-2">
                {p.role !== 'player' && (
                  <span className="rounded-full bg-field-green/10 px-2 py-0.5 text-xs text-field-green-dark">
                    {roleLabels[p.role]}
                  </span>
                )}
                {p.email_confirmed === false && (
                  <span className="rounded-full bg-field-yellow/20 px-2 py-0.5 text-xs text-field-orange">
                    In attesa
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
