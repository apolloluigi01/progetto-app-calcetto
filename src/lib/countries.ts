export interface Country {
  code: string
  name: string
}

// Elenco curato di nazionalità comuni tra i giocatori (nome in italiano, codice ISO 3166-1 alpha-2).
export const COUNTRIES: Country[] = [
  { code: 'IT', name: 'Italia' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AR', name: 'Argentina' },
  { code: 'BE', name: 'Belgio' },
  { code: 'BR', name: 'Brasile' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'CM', name: 'Camerun' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CI', name: "Costa d'Avorio" },
  { code: 'HR', name: 'Croazia' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egitto' },
  { code: 'FR', name: 'Francia' },
  { code: 'DE', name: 'Germania' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GB', name: 'Inghilterra' },
  { code: 'MA', name: 'Marocco' },
  { code: 'MX', name: 'Messico' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NL', name: 'Paesi Bassi' },
  { code: 'PE', name: 'Perù' },
  { code: 'PL', name: 'Polonia' },
  { code: 'PT', name: 'Portogallo' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'SN', name: 'Senegal' },
  { code: 'RS', name: 'Serbia' },
  { code: 'ES', name: 'Spagna' },
  { code: 'CH', name: 'Svizzera' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Turchia' },
  { code: 'UA', name: 'Ucraina' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'VE', name: 'Venezuela' },
]

export function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return '🏳️'
  const upper = code.toUpperCase()
  const points = [...upper].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65))
  return String.fromCodePoint(...points)
}

export function countryName(code: string | null): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? ''
}
