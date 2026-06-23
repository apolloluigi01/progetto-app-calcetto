import { FunctionsHttpError } from '@supabase/supabase-js'

export async function getFunctionErrorMessage(error: unknown, fallback = 'Si è verificato un errore'): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      if (typeof body?.error === 'string') {
        if (body.error.includes('already been registered')) {
          return 'Esiste già un account associato a questa mail'
        }
        return body.error
      }
    } catch {
      // risposta non JSON, usa il messaggio di fallback
    }
  }
  return fallback
}
