import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getFunctionErrorMessage } from '../lib/functionErrors'
import type { Player, PlayerRole } from '../types/database'

type PlayerWithStatus = Player & { email?: string | null; email_confirmed?: boolean }

export default function GiocatoreDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, isAdmin, isSuperAdmin } = useAuth()

  const [player, setPlayer] = useState<PlayerWithStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [role, setRole] = useState<PlayerRole>('player')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isSelf = session?.user.id === id

  async function load() {
    if (!id) return
    setLoading(true)
    if (isAdmin) {
      const { data, error } = await supabase.functions.invoke<{ players: PlayerWithStatus[] }>('list-players')
      if (error) setError(error.message)
      const found = data?.players.find((p) => p.id === id) ?? null
      setPlayer(found)
    } else {
      const { data, error } = await supabase.from('players').select('*').eq('id', id).single()
      if (error) setError(error.message)
      setPlayer((data as Player) ?? null)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id, isAdmin])

  useEffect(() => {
    if (!player) return
    setName(player.name)
    setNickname(player.nickname ?? '')
    setRole(player.role)
  }, [player])

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !player) return <div className="p-4 text-sm text-red-600">{error ?? 'Giocatore non trovato'}</div>

  const canEdit = isSuperAdmin || (isAdmin && player.role === 'player') || isSelf
  const canDelete = !isSelf && (isSuperAdmin || (isAdmin && player.role === 'player'))

  async function handleSave() {
    if (!id) return
    setSaving(true)
    setError(null)

    const update: { name: string; nickname: string | null; role?: PlayerRole } = {
      name,
      nickname: nickname || null,
    }
    if (isSuperAdmin) update.role = role

    const { error } = await supabase.from('players').update(update).eq('id', id)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  async function handleDelete() {
    if (!id || !confirm(`Eliminare ${player?.name}? L'account verrà rimosso definitivamente.`)) return
    setDeleting(true)
    const { error } = await supabase.functions.invoke('delete-player', { body: { playerId: id } })
    setDeleting(false)
    if (error) {
      setError(await getFunctionErrorMessage(error, 'Errore nell\'eliminazione del giocatore'))
      return
    }
    navigate('/giocatori')
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">{player.name}</h1>

      <div className="mt-4 rounded-xl bg-white p-4 shadow">
        {canEdit ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nickname</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            {isSuperAdmin && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Ruolo</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as PlayerRole)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="player">Player</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
            )}
            {isAdmin && player.email && (
              <p className="text-xs text-gray-500">
                {player.email} —{' '}
                {player.email_confirmed ? 'email confermata' : 'in attesa di conferma'}
              </p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
            >
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        ) : (
          <div>
            {player.nickname && <p className="text-sm text-gray-500">{player.nickname}</p>}
            <p className="mt-1 text-xs uppercase text-field-green">{player.role}</p>
          </div>
        )}
      </div>

      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="mt-4 w-full rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          {deleting ? 'Eliminazione...' : 'Elimina giocatore'}
        </button>
      )}
    </div>
  )
}
