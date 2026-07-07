import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getFunctionErrorMessage } from '../../lib/functionErrors'
import { logActivity, type FieldChange } from '../../lib/activityLog'
import { COUNTRIES } from '../../lib/countries'
import type { Player, PlayerRole, PlayingPosition } from '../../types/database'

type PlayerWithStatus = Player & { email?: string | null; email_confirmed?: boolean }

export default function GiocatoreEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, isAdmin, isSuperAdmin } = useAuth()

  const [player, setPlayer] = useState<PlayerWithStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [nickname, setNickname] = useState('')
  const [role, setRole] = useState<PlayerRole>('player')
  const [nationality, setNationality] = useState('')
  const [position, setPosition] = useState<PlayingPosition | ''>('')
  const [jerseyNumber, setJerseyNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const [overallValue, setOverallValue] = useState<number>(50)
  const [initialOverall, setInitialOverall] = useState<number>(50)
  const [savingOverall, setSavingOverall] = useState(false)
  const [overallSaved, setOverallSaved] = useState(false)
  const [overallError, setOverallError] = useState<string | null>(null)

  const [showResetPassword, setShowResetPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetting, setResetting] = useState(false)

  const isSelf = session?.user.id === id

  async function load() {
    if (!id) return
    setLoading(true)
    const [listRes, ratingRes] = await Promise.all([
      supabase.functions.invoke<{ players: PlayerWithStatus[] }>('list-players'),
      supabase.from('ratings').select('rating_value').eq('player_id', id).maybeSingle(),
    ])
    if (listRes.error) setError(listRes.error.message)
    setPlayer(listRes.data?.players.find((p) => p.id === id) ?? null)
    if (ratingRes.data) {
      const val = Math.round(Number(ratingRes.data.rating_value))
      setOverallValue(val)
      setInitialOverall(val)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id])

  useEffect(() => {
    if (!player) return
    setName(player.name)
    setSurname(player.surname ?? '')
    setNickname(player.nickname ?? '')
    setRole(player.role)
    setNationality(player.nationality ?? '')
    setPosition(player.position ?? '')
    setJerseyNumber(player.jersey_number ? String(player.jersey_number) : '')
  }, [player])

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !player) return <div className="p-4 text-sm text-red-600">{error ?? 'Giocatore non trovato'}</div>

  // Nome/cognome/nickname/ruolo/password: un admin normale può toccarli solo su un
  // giocatore semplice, non su un altro admin/superadmin. L'overall invece è un valore
  // di gioco, non un privilegio sull'account: qualunque admin lo modifica per chiunque.
  const canEditDetails = isSuperAdmin || (isAdmin && player.role === 'player')
  const canEditOverall = isAdmin
  const canDelete = !isSelf && canEditDetails

  function targetLabel(): string {
    return `${player?.name ?? ''}${player?.surname ? ` ${player.surname}` : ''}`.trim()
  }

  function handleAvatarFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setAvatarError(null)
    if (!file) {
      setAvatarFile(null)
      setAvatarPreview(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setAvatarError('Seleziona un file immagine (jpg, png, webp...).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("L'immagine non può superare i 5 MB.")
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleUploadAvatar() {
    if (!id || !avatarFile) return
    setUploadingAvatar(true)
    setAvatarError(null)

    const ext = avatarFile.name.split('.').pop() ?? 'jpg'
    const path = `${id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, avatarFile, { contentType: avatarFile.type })
    if (uploadError) {
      setUploadingAvatar(false)
      setAvatarError(uploadError.message)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: updateError } = await supabase
      .from('players')
      .update({ avatar_url: urlData.publicUrl })
      .eq('id', id)
    setUploadingAvatar(false)
    if (updateError) {
      setAvatarError(updateError.message)
      return
    }

    logActivity('giocatore_modificato', {
      playerId: id,
      giocatore: targetLabel(),
      modifiche: [{ campo: 'Foto profilo', da: player?.avatar_url ? 'presente' : '(vuota)', a: 'aggiornata' }],
    })
    setAvatarFile(null)
    setAvatarPreview(null)
    load()
  }

  async function handleSave() {
    if (!id || !player) return
    setSaving(true)
    setError(null)

    const parsedJerseyNumber = jerseyNumber ? Number(jerseyNumber) : null

    const update: {
      name: string
      surname: string | null
      nickname: string | null
      role?: PlayerRole
      nationality: string | null
      position: PlayingPosition | null
      jersey_number: number | null
    } = {
      name,
      surname: surname || null,
      nickname: nickname || null,
      nationality: nationality || null,
      position: position || null,
      jersey_number: parsedJerseyNumber,
    }
    if (isSuperAdmin) update.role = role

    const { error } = await supabase.from('players').update(update).eq('id', id)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }

    const modifiche: FieldChange[] = []
    if (player.name !== name) modifiche.push({ campo: 'Nome', da: player.name, a: name })
    if ((player.surname ?? '') !== surname) {
      modifiche.push({ campo: 'Cognome', da: player.surname || '(vuoto)', a: surname || '(vuoto)' })
    }
    if ((player.nickname ?? '') !== nickname) {
      modifiche.push({ campo: 'Nickname', da: player.nickname || '(vuoto)', a: nickname || '(vuoto)' })
    }
    if (isSuperAdmin && player.role !== role) modifiche.push({ campo: 'Ruolo', da: player.role, a: role })
    if ((player.nationality ?? '') !== nationality) {
      modifiche.push({ campo: 'Nazionalità', da: player.nationality || '(vuoto)', a: nationality || '(vuoto)' })
    }
    if ((player.position ?? '') !== position) {
      modifiche.push({ campo: 'Ruolo di gioco', da: player.position || '(vuoto)', a: position || '(vuoto)' })
    }
    if ((player.jersey_number ?? null) !== parsedJerseyNumber) {
      modifiche.push({
        campo: 'Numero maglia',
        da: player.jersey_number ? String(player.jersey_number) : '(vuoto)',
        a: parsedJerseyNumber ? String(parsedJerseyNumber) : '(vuoto)',
      })
    }

    if (modifiche.length > 0) {
      logActivity('giocatore_modificato', { playerId: id, giocatore: targetLabel(), modifiche })
    }
    load()
  }

  async function handleSaveOverall() {
    if (!id || !player) return
    setSavingOverall(true)
    setOverallSaved(false)
    setOverallError(null)
    const val = Math.min(100, Math.max(1, Math.round(overallValue)))
    const fascia = val >= 75 ? 'A' : val >= 55 ? 'B' : val >= 35 ? 'C' : 'D'
    const { error: upsertError } = await supabase
      .from('ratings')
      .upsert(
        { player_id: id, rating_value: val, fascia, updated_at: new Date().toISOString() },
        { onConflict: 'player_id' },
      )
    setSavingOverall(false)
    if (upsertError) {
      setOverallError(upsertError.message)
      return
    }
    setOverallSaved(true)

    if (val !== initialOverall) {
      logActivity('overall_modificato', {
        playerId: id,
        giocatore: targetLabel(),
        modifiche: [{ campo: 'Overall', da: String(initialOverall), a: String(val) }],
      })
      setInitialOverall(val)
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault()
    if (!id) return
    setResetError(null)
    if (newPassword.length < 6) {
      setResetError('La password deve essere di almeno 6 caratteri')
      return
    }

    setResetting(true)
    const { error } = await supabase.functions.invoke('admin-reset-password', {
      body: { playerId: id, newPassword },
    })
    setResetting(false)
    if (error) {
      setResetError(await getFunctionErrorMessage(error, "Errore nel reset della password"))
      return
    }

    setNewPassword('')
    setShowResetPassword(false)
    setResetSuccess(true)
    logActivity('password_reimpostata', { nome: player?.name, playerId: id })
  }

  async function handleDelete() {
    if (!id || !confirm(`Eliminare ${player?.name}? L'account verrà rimosso definitivamente.`)) return
    setDeleting(true)
    const { error } = await supabase.functions.invoke('delete-player', { body: { playerId: id } })
    setDeleting(false)
    if (error) {
      setError(await getFunctionErrorMessage(error, "Errore nell'eliminazione del giocatore"))
      return
    }
    await logActivity('giocatore_eliminato', { nome: player?.name, playerId: id })
    navigate('/admin/giocatori')
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">
        {player.name}
        {player.surname && ` ${player.surname}`}
      </h1>

      <div className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow">
        {canEditDetails ? (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cognome</label>
              <input
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
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

            <div className="border-t border-gray-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Carta giocatore
              </p>

              <div className="mb-3 flex items-center gap-3">
                {avatarPreview || player.avatar_url ? (
                  <img
                    src={avatarPreview ?? player.avatar_url ?? undefined}
                    alt=""
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-field-green/10 text-lg font-bold text-field-green-dark">
                    {player.name.charAt(0).toUpperCase()}
                    {player.surname ? player.surname.charAt(0).toUpperCase() : ''}
                  </div>
                )}
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Foto profilo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                    className="w-full text-xs text-gray-600"
                  />
                  {avatarError && <p className="mt-1 text-xs text-red-600">{avatarError}</p>}
                  {avatarFile && (
                    <button
                      type="button"
                      onClick={handleUploadAvatar}
                      disabled={uploadingAvatar}
                      className="mt-2 rounded-lg bg-field-green px-3 py-1.5 text-xs font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
                    >
                      {uploadingAvatar ? 'Caricamento...' : 'Carica foto'}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nazionalità</label>
                  <select
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="">-</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Ruolo di gioco</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as PlayingPosition | '')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="">-</option>
                    <option value="POR">Portiere (POR)</option>
                    <option value="DIF">Difensore (DIF)</option>
                    <option value="CEN">Centrocampista (CEN)</option>
                    <option value="ATT">Attaccante (ATT)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Numero maglia</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Lo stile della carta (bronzo/argento/oro/speciale/blu) è determinato automaticamente
                dall'overall del giocatore.
              </p>
            </div>
            {player.email && (
              <p className="text-xs text-gray-500">
                {player.email} — {player.email_confirmed ? 'email confermata' : 'in attesa di conferma'}
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
          </>
        ) : (
          <div>
            {player.nickname && <p className="text-sm text-gray-500">{player.nickname}</p>}
            <p className="mt-1 text-xs uppercase text-field-green">{player.role}</p>
            <p className="mt-2 text-xs text-gray-400">
              Solo un superadmin può modificare nome, cognome, nickname, ruolo o password di un altro admin.
              L'overall resta modificabile qui sotto.
            </p>
          </div>
        )}
      </div>

      {canEditOverall && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium text-gray-800">Overall iniziale</h2>
          <p className="mt-1 text-xs text-gray-500">
            Valore usato per la generazione automatica delle squadre quando il giocatore non ha ancora statistiche (1–100).
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={100}
              value={overallValue}
              onChange={(e) => {
                setOverallSaved(false)
                setOverallValue(Number(e.target.value))
              }}
              className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-bold"
            />
            <input
              type="range"
              min={1}
              max={100}
              value={overallValue}
              onChange={(e) => {
                setOverallSaved(false)
                setOverallValue(Number(e.target.value))
              }}
              className="flex-1 accent-field-green-dark"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Fascia: {overallValue >= 75 ? 'A (top)' : overallValue >= 55 ? 'B' : overallValue >= 35 ? 'C' : 'D (base)'}
          </p>
          {overallSaved && <p className="mt-1 text-xs text-green-700">Overall salvato.</p>}
          {overallError && <p className="mt-1 text-xs text-red-600">{overallError}</p>}
          <button
            onClick={handleSaveOverall}
            disabled={savingOverall}
            className="mt-3 w-full rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
          >
            {savingOverall ? 'Salvataggio...' : 'Salva overall'}
          </button>
        </div>
      )}

      {canEditDetails && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium text-gray-800">Password</h2>
          <p className="mt-1 text-xs text-gray-500">
            Per motivi di sicurezza la password attuale non può essere visualizzata. Puoi impostarne una nuova:
            l'utente dovrà sceglierne una propria al prossimo accesso.
          </p>

          {resetSuccess && <p className="mt-2 text-sm text-green-700">Password reimpostata correttamente.</p>}

          {showResetPassword ? (
            <form onSubmit={handleResetPassword} className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="newPassword">
                  Nuova password (min. 6 caratteri)
                </label>
                <input
                  id="newPassword"
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
                />
              </div>

              {resetError && <p className="text-sm text-red-600">{resetError}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={resetting}
                  className="flex-1 rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
                >
                  {resetting ? 'Salvataggio...' : 'Reimposta password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPassword(false)
                    setResetError(null)
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Annulla
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => {
                setShowResetPassword(true)
                setResetSuccess(false)
              }}
              className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Reimposta password
            </button>
          )}
        </div>
      )}

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
