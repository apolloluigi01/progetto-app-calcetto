/**
 * Attesa mostrata mentre arriva il codice di una schermata caricata su
 * richiesta (React.lazy). È volutamente discreta: su rete decente il caricamento
 * dura una frazione di secondo, e un blocco vistoso darebbe più fastidio
 * dell'attesa stessa.
 */
export default function PageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Caricamento in corso</span>
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-field-green motion-reduce:animate-none" />
    </div>
  )
}
