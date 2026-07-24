import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

/**
 * Tasto "Modifica" standard di tutta l'app: sfondo bianco, bordo grigio e
 * icona a matita. Usarlo ovunque compaia un'azione di modifica, sia come
 * bottone (onClick) sia come link (to). Passare `className` per larghezza o
 * spaziatura specifiche (es. "w-full", "flex-1").
 */
function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793Z" />
      <path d="M11.379 5.793 3 14.172V17h2.828l8.379-8.379-2.828-2.828Z" />
    </svg>
  )
}

const baseClass =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60'

interface EditButtonProps {
  children?: ReactNode
  to?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}

export default function EditButton({
  children = 'Modifica',
  to,
  onClick,
  type = 'button',
  disabled,
  className = '',
}: EditButtonProps) {
  const cls = `${baseClass} ${className}`
  if (to) {
    return (
      <Link to={to} className={cls}>
        <PencilIcon />
        {children}
      </Link>
    )
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      <PencilIcon />
      {children}
    </button>
  )
}
