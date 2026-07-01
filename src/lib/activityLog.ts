import { supabase } from './supabase'

export type ActivityAction =
  | 'giocatore_creato'
  | 'giocatore_modificato'
  | 'giocatore_eliminato'
  | 'password_reimpostata'
  | 'partita_creata'
  | 'partita_modificata'
  | 'risultato_salvato'
  | 'gol_aggiunto'
  | 'gol_rimosso'
  | 'pagelle_bozza'
  | 'pagelle_pubblicate'
  | 'partita_eliminata'
  | 'sondaggio_aperto'
  | 'sondaggio_chiuso'
  | 'squadre_generate'
  | 'prenotazione_aggiunta'
  | 'prenotazione_rimossa'

export const actionLabels: Record<ActivityAction, string> = {
  giocatore_creato:      'Giocatore creato',
  giocatore_modificato:  'Giocatore modificato',
  giocatore_eliminato:   'Giocatore eliminato',
  password_reimpostata:  'Password reimpostata',
  partita_creata:        'Partita creata',
  partita_modificata:    'Partita modificata',
  risultato_salvato:     'Risultato salvato',
  gol_aggiunto:          'Gol aggiunto',
  gol_rimosso:           'Gol rimosso',
  pagelle_bozza:         'Pagelle salvate in bozza',
  pagelle_pubblicate:    'Pagelle pubblicate',
  partita_eliminata:     'Partita eliminata',
  sondaggio_aperto:      'Sondaggio aperto',
  sondaggio_chiuso:      'Sondaggio chiuso',
  squadre_generate:      'Squadre generate',
  prenotazione_aggiunta: 'Prenotazione aggiunta (admin)',
  prenotazione_rimossa:  'Prenotazione rimossa (admin)',
}

export async function logActivity(
  action: ActivityAction,
  details: Record<string, unknown> = {}
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: player } = await supabase
    .from('players')
    .select('name')
    .eq('id', user.id)
    .single()

  await supabase.from('admin_activity_log').insert({
    admin_id:   user.id,
    admin_name: player?.name ?? 'Admin',
    action,
    details,
  })
}
