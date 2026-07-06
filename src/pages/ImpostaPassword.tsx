import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { validatePassword } from '../lib/passwordPolicy'

export default function ImpostaPassword() {
  const { session, loading: authLoading, signOut } = useAuth()
  const [searchParams] = useSearchParams()
  const tokenHash = searchParams.get('token_hash')
  const hasValidToken = Boolean(tokenHash) && searchParams.get('type') === 'signup'

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

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

    // Il token viene consumato solo qui, al submit del form: se il link e' stato
    // "pre-visitato" da uno scanner antispam (che fa solo una GET sulla pagina,
    // senza inviare il form), il token resta valido per il click reale dell'utente.
    if (hasValidToken) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: 'signup',
      })
      if (verifyError) {
        setSubmitting(false)
        setError('Il link di attivazione non e\' piu\' valido o e\' scaduto. Chiedi a un amministratore di generarne uno nuovo.')
        return
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setSubmitting(false)
      setError(updateError.message)
      return
    }

    const { error: rpcError } = await supabase.rpc('clear_must_change_password')
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }

    window.location.assign('/')
  }

  if (authLoading) {
    return <div className="flex min-h-svh items-center justify-center">Caricamento...</div>
  }

  if (!session && !hasValidToken) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-field-green px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="text-sm text-gray-500">
            Link non valido o scaduto. Chiedi a un amministratore di generarne uno nuovo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-field-green px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-2xl font-semibold text-field-green-dark">Imposta una nuova password</h1>
        <p className="mb-6 text-sm text-gray-500">
          Per motivi di sicurezza devi scegliere una password personale prima di continuare. Deve avere almeno 6
          caratteri, una lettera maiuscola e un numero.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="password">
              Nuova password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="confirmPassword">
              Conferma password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white transition hover:bg-field-green-dark disabled:opacity-60"
          >
            {submitting ? 'Salvataggio...' : 'Salva password'}
          </button>
        </form>

        {session && (
          <button onClick={signOut} className="mt-4 w-full text-sm text-gray-500 hover:underline">
            Esci
          </button>
        )}
      </div>
    </div>
  )
}
