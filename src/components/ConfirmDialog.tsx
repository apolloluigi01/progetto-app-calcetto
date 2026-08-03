import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

/**
 * Conferme e avvisi dell'app, al posto di confirm() e alert() del browser.
 *
 * I dialoghi di sistema bloccano il thread, non si possono impaginare e nella
 * PWA installata (soprattutto su iOS) rompono l'illusione dell'app nativa,
 * mostrando per giunta il dominio del sito. Qui l'attesa della risposta resta
 * la stessa — `await confirm(...)` — così le funzioni che li usavano cambiano
 * pochissimo.
 */

interface ConfirmOptions {
  title?: string
  message: string
  /** Testo del pulsante di conferma. */
  confirmLabel?: string
  cancelLabel?: string
  /** Colora di rosso il pulsante di conferma: per azioni distruttive. */
  destructive?: boolean
  /** Solo avviso: mostra un unico pulsante di chiusura (come alert()). */
  alertOnly?: boolean
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(typeof opts === 'string' ? { message: opts } : opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  function close(result: boolean) {
    setOptions(null)
    resolver.current?.(result)
    resolver.current = null
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-base font-semibold text-gray-900">
              {options.title ?? (options.alertOnly ? 'Avviso' : 'Confermi?')}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm text-gray-600">{options.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              {!options.alertOnly && (
                <button
                  onClick={() => close(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {options.cancelLabel ?? 'Annulla'}
                </button>
              )}
              <button
                autoFocus
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  options.destructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-field-green hover:bg-field-green-dark'
                }`}
              >
                {options.confirmLabel ?? (options.alertOnly ? 'Ho capito' : 'Conferma')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

/** `const confirm = useConfirm()` e poi `if (await confirm('...')) { ... }`. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm deve essere usato dentro ConfirmProvider')
  return ctx
}
