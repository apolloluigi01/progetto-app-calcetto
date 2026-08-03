/**
 * Sagome di caricamento al posto della scritta "Caricamento...".
 *
 * A parità di tempi reali l'attesa si percepisce più breve, perché si vede
 * subito la forma di quello che sta arrivando invece di una riga di testo che
 * poi salta via. `animate-pulse` si disattiva da sé con "riduci movimento".
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  )
}

/** Elenco di righe/card: il caso più frequente nell'app. */
export function SkeletonList({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-live="polite">
      <span className="sr-only">Caricamento in corso</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl bg-white p-4 shadow-sm">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}
