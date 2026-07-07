import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { validatePassword } from '../lib/passwordPolicy'

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

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

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
    if (!session || !avatarFile) return
    setUploadingAvatar(true)
    setAvatarError(null)

    const ext = avatarFile.name.split('.').pop() ?? 'jpg'
    const path = `${session.user.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, avatarFile, { contentType: avatarFile.type })
    if (uploadError) {
      setUploadingAvatar(false)
      setAvatarError(uploadError.message)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: rpcError } = await supabase.rpc('update_own_avatar', { new_avatar_url: urlData.publicUrl })
    setUploadingAvatar(false)
    if (rpcError) {
      setAvatarError(rpcError.message)
      return
    }

    await refreshPlayer()
    setAvatarFile(null)
    setAvatarPreview(null)
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
              <p className="text-xs text-gray-500">Tocca l'immagine per sceglierne una nuova</p>
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
