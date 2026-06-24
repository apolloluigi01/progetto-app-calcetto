// Regole applicate quando un utente sceglie la propria password (primo accesso, cambio password,
// reset via "password dimenticata"). La password iniziale impostata da un admin non passa da qui:
// resta libera (es. "123456") perche' l'utente sara' comunque obbligato a sostituirla al primo accesso.
export function validatePassword(password: string): string | null {
  if (password.length < 6) return 'La password deve contenere almeno 6 caratteri.'
  if (!/[A-Z]/.test(password)) return 'La password deve contenere almeno una lettera maiuscola.'
  if (!/[0-9]/.test(password)) return 'La password deve contenere almeno un numero.'
  return null
}
