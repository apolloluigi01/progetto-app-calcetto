import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Errore non gestito:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="text-lg font-semibold text-field-green-dark">Qualcosa è andato storto</h1>
          <p className="max-w-sm text-sm text-gray-500">
            Si è verificato un errore imprevisto. Prova a ricaricare la pagina; se il problema persiste, avvisa chi
            gestisce l'app.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark"
          >
            Ricarica
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
