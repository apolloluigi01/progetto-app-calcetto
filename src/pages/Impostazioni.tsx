import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { validatePassword } from '../lib/passwordPolicy'
import { COUNTRIES } from '../lib/countries'
import type { PlayingPosition } from '../types/database'

const roleLabels: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  player: 'Player',
}

export default function Impostazioni() {
  const { player, session, refreshPlayer } = useAuth()

  const [showForm, setShowForm] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [editingNickname, setEditingNickname] = useState(false)
  const [nickname, setNickname] = useState(player?.nickname ?? '')
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const [savingNickname, setSavingNickname] = useState(false)

  const [nationality, setNationality] = useState(player?.nationality ?? '')
  const [position, setPosition] = useState<PlayingPosition | ''>(player?.position ?? '')
  const [jerseyNumber, setJerseyNumber] = useState(player?.jersey_number ? String(player.jersey_number) : '')
  const [cardError, setCardError] = useState<string | null>(null)
  const [savingCard, setSavingCard] = useState(false)
  const [cardSaved, setCardSaved] = useState(false)

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarSaved, setAvatarSaved] = useState(false)

  // Il caricamento parte subito alla scelta del file: il flusso in due passi
  // (anteprima + pulsante separato "Carica foto") traeva in inganno, perché
  // l'anteprima locale sembrava già la foto salvata mentre sul server non
  // era ancora arrivato nulla.
  async function handleAvatarFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    setAvatarError(null)
    setAvatarSaved(false)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAvatarError('Seleziona un file immagine (jpg, png, webp...).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("L'immagine non può superare i 5 MB.")
      return
    }
    if (!session) return

    setAvatarPreview(URL.createObjectURL(file))
    setUploadingAvatar(true)

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${session.user.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { contentType: file.type })
    if (uploadError) {
      setUploadingAvatar(false)
      setAvatarPreview(null)
      setAvatarError(uploadError.message)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: rpcError } = await supabase.rpc('update_own_avatar', { new_avatar_url: urlData.publicUrl })
    setUploadingAvatar(false)
    if (rpcError) {
      setAvatarPreview(null)
      setAvatarError(rpcError.message)
      return
    }

    await refreshPlayer()
    setAvatarPreview(null)
    setAvatarSaved(true)
  }

  async function handleSaveNickname(e: FormEvent) {
    e.preventDefault()
    setNicknameError(null)

    if (nickname.trim().length > 30) {
      setNicknameError('Il nickname non può superare 30 caratteri.')
      return
    }

    setSavingNickname(true)
    const { error: rpcError } = await supabase.rpc('update_own_nickname', { new_nickname: nickname })
    setSavingNickname(false)
    if (rpcError) {
      setNicknameError(rpcError.message)
      return
    }

    await refreshPlayer()
    setEditingNickname(false)
  }

  async function handleSaveCard(e: FormEvent) {
    e.preventDefault()
    setCardError(null)
    setCardSaved(false)

    const parsedJersey = jerseyNumber.trim() === '' ? null : Number(jerseyNumber)
    if (parsedJersey !== null && (!Number.isInteger(parsedJersey) || parsedJersey < 1 || parsedJersey > 99)) {
      setCardError('Il numero di maglia deve essere un intero tra 1 e 99.')
      return
    }

    setSavingCard(true)
    const { error: rpcError } = await supabase.rpc('update_own_card', {
      new_nationality: nationality || null,
      new_position: position || null,
      new_jersey_number: parsedJersey,
    })
    setSavingCard(false)
    if (rpcError) {
      setCardError(rpcError.message)
      return
    }

    await refreshPlayer()
    setCardSaved(true)
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const policyError = validatePassword(password)
    if (policyError) {
      setError(policyError)
      return
    }
    if (password !== confirmPassword) {
      setError('Le due password non coincidono.')
      return
    }

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    setPassword('')
    setConfirmPassword('')
    setShowForm(false)
    setSuccess(true)
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">Impostazioni</h1>

      {player && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-3">
            <label className="relative block shrink-0 cursor-pointer" title="Cambia foto profilo">
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
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-field-green text-xs text-white shadow ring-2 ring-white">
                📷
              </span>
              <input type="file" accept="image/*" onChange={handleAvatarFileChange} className="hidden" />
            </label>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">Foto profilo</p>
              <p className="text-xs text-gray-500">
                Tocca l'immagine per sceglierne una nuova: viene salvata subito.
              </p>
              {uploadingAvatar && <p className="mt-1 text-xs text-field-green-dark">Caricamento in corso...</p>}
              {avatarSaved && !uploadingAvatar && (
                <p className="mt-1 text-xs text-green-700">✓ Foto salvata.</p>
              )}
              {avatarError && <p className="mt-1 text-xs text-red-600">{avatarError}</p>}
            </div>
          </div>

          <p className="mt-3 font-medium">{player.name}</p>

          {editingNickname ? (
            <form onSubmit={handleSaveNickname} className="mt-2 space-y-2">
              <input
                autoFocus
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Il tuo nickname"
                maxLength={30}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-field-green focus:outline-none"
              />
              {nicknameError && <p className="text-sm text-red-600">{nicknameError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingNickname}
                  className="rounded-lg bg-field-green px-3 py-1.5 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
                >
                  {savingNickname ? 'Salvataggio...' : 'Salva'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingNickname(false)
                    setNicknameError(null)
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Annulla
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <p className="text-sm text-gray-500">{player.nickname || 'Nessun nickname impostato'}</p>
              <button
                onClick={() => {
                  setNickname(player.nickname ?? '')
                  setEditingNickname(true)
                }}
                className="text-xs font-medium text-field-green hover:underline"
              >
                Modifica
              </button>
            </div>
          )}

          {session?.user.email && <p className="mt-1 text-sm text-gray-500">{session.user.email}</p>}
          <p className="mt-2 text-xs uppercase text-field-green">{roleLabels[player.role] ?? player.role}</p>
        </div>
      )}

      {player && (
        <form onSubmit={handleSaveCard} className="mt-4 rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium text-gray-800">Carta giocatore</h2>
          <p className="mt-1 text-xs text-gray-500">
            Nazionalità, ruolo di gioco e numero di maglia mostrati sulla tua carta.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nazionalità</label>
              <select
                value={nationality}
                onChange={(e) => {
                  setCardSaved(false)
                  setNationality(e.target.value)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-field-green focus:outline-none"
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
                onChange={(e) => {
                  setCardSaved(false)
                  setPosition(e.target.value as PlayingPosition | '')
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-field-green focus:outline-none"
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
                onChange={(e) => {
                  setCardSaved(false)
                  setJerseyNumber(e.target.value)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-field-green focus:outline-none"
              />
            </div>
          </div>

          {cardError && <p className="mt-2 text-sm text-red-600">{cardError}</p>}
          {cardSaved && <p className="mt-2 text-sm text-green-700">✓ Carta giocatore aggiornata.</p>}

          <button
            type="submit"
            disabled={savingCard}
            className="mt-3 w-full rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
          >
            {savingCard ? 'Salvataggio...' : 'Salva carta giocatore'}
          </button>
        </form>
      )}

      <div className="mt-4 rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium text-gray-800">Sicurezza</h2>

        {success && <p className="mt-2 text-sm text-green-700">Password aggiornata correttamente.</p>}

        {showForm ? (
          <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="newPassword">
                Nuova password
              </label>
              <input
                id="newPassword"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="confirmNewPassword">
                Conferma password
              </label>
              <input
                id="confirmNewPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
              >
                {submitting ? 'Salvataggio...' : 'Salva'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setError(null)
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
              setShowForm(true)
              setSuccess(false)
            }}
            className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Cambia password
          </button>
        )}
      </div>

      <Link
        to="/registro-attivita"
        className="mt-4 block rounded-lg border border-gray-300 px-4 py-2 text-center text-sm text-gray-700 hover:bg-gray-50"
      >
        Registro attività admin
      </Link>
    </div>
  )
}
