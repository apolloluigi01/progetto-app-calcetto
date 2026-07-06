import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { validatePassword } from '../lib/passwordPolicy'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tokenHash = searchParams.get('token_hash')
  const hasValidToken = Boolean(tokenHash) && searchParams.get('type') === 'recovery'

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

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
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash!,
      type: 'recovery',
    })
    if (verifyError) {
      setSubmitting(false)
      setError('Il link non e\' piu\' valido o e\' scaduto. Richiedi un nuovo link dalla pagina "Password dimenticata".')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setSubmitting(false)
      setError(updateError.message)
      return
    }

    await supabase.rpc('clear_must_change_password')
    setSubmitting(false)
    setDone(true)
    setTimeout(() => navigate('/'), 1500)
  }

  if (!hasValidToken) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-field-green px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="text-sm text-gray-500">
            Link non valido o scaduto. Richiedi un nuovo link dalla pagina "Password dimenticata".
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-field-green px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-2xl font-semibold text-field-green-dark">Reimposta password</h1>
        <p className="mb-6 text-sm text-gray-500">
          Scegli una nuova password: almeno 6 caratteri, una lettera maiuscola e un numero.
        </p>

        {done ? (
          <p className="text-sm text-green-700">Password aggiornata. Reindirizzamento in corso...</p>
        ) : (
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
        )}
      </div>
    </div>
  )
}
