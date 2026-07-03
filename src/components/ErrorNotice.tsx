interface Props {
  message: string
  onRetry?: () => void
}

export default function ErrorNotice({ message, onRetry }: Props) {
  return (
    <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">
      <p>{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-medium underline">
          Riprova
        </button>
      )}
    </div>
  )
}
