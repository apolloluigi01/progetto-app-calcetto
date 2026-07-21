export interface WeatherForecast {
  weatherCode: number
  tempMax: number
  tempMin: number
  precipitationProbability: number | null
  locationName: string
}

const WEATHER_CODE_MAP: Record<number, { label: string; icon: string }> = {
  0: { label: 'Sereno', icon: '☀️' },
  1: { label: 'Prevalentemente sereno', icon: '🌤️' },
  2: { label: 'Parzialmente nuvoloso', icon: '⛅' },
  3: { label: 'Nuvoloso', icon: '☁️' },
  45: { label: 'Nebbia', icon: '🌫️' },
  48: { label: 'Nebbia con brina', icon: '🌫️' },
  51: { label: 'Pioviggine leggera', icon: '🌦️' },
  53: { label: 'Pioviggine', icon: '🌦️' },
  55: { label: 'Pioviggine intensa', icon: '🌧️' },
  61: { label: 'Pioggia debole', icon: '🌦️' },
  63: { label: 'Pioggia', icon: '🌧️' },
  65: { label: 'Pioggia forte', icon: '🌧️' },
  71: { label: 'Neve debole', icon: '🌨️' },
  73: { label: 'Neve', icon: '🌨️' },
  75: { label: 'Neve forte', icon: '🌨️' },
  80: { label: 'Rovesci deboli', icon: '🌦️' },
  81: { label: 'Rovesci', icon: '🌧️' },
  82: { label: 'Rovesci violenti', icon: '⛈️' },
  95: { label: 'Temporale', icon: '⛈️' },
  96: { label: 'Temporale con grandine', icon: '⛈️' },
  99: { label: 'Temporale con grandine forte', icon: '⛈️' },
}

export function describeWeatherCode(code: number): { label: string; icon: string } {
  return WEATHER_CODE_MAP[code] ?? { label: 'N/D', icon: '🌡️' }
}

async function geocodeQuery(query: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=it&format=json`
  )
  if (!res.ok) return null
  const data = await res.json()
  const results: { latitude: number; longitude: number; name: string; country_code?: string }[] =
    data?.results ?? []
  if (results.length === 0) return null
  // App italiana: a parità di nome preferisci il risultato in Italia, per
  // evitare omonimi esteri (es. la sigla "NA" che altrimenti geocodifica a un
  // villaggio in Thailandia, restituendo un meteo completamente sbagliato).
  const chosen = results.find((r) => r.country_code === 'IT') ?? results[0]
  return { lat: chosen.latitude, lon: chosen.longitude, name: chosen.name }
}

// Parole che non sono toponimi (tipo di via, tipo di impianto): vanno scartate
// dai candidati, altrimenti la geocodifica sceglie luoghi a caso.
const NON_TOPONIMO = new Set([
  'via', 'viale', 'piazza', 'piazzale', 'largo', 'corso', 'vicolo', 'strada',
  'traversa', 'contrada', 'localita', 'località', 'campo', 'centro', 'sportivo',
  'stadio', 'club', 'complesso', 'impianto', 'comunale', 'polisportiva',
])

// Il campo inserito è spesso l'indirizzo dell'impianto (es. "Club Saggese - Via
// Club Saggese, 80021 Afragola NA") e non una città, quindi la geocodifica
// sull'intera stringa fallisce quasi sempre. Come fallback si prova con le
// singole parole "significative": si scartano CAP/numeri, le sigle di provincia
// (2 lettere, es. "NA") e le parole non toponimo (Via, Club, ...). Il comune di
// solito è l'ultima parola significativa, quindi si prova dall'ultima.
async function geocodeField(query: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const trimmed = query.trim()
  const words = trimmed
    .replace(/[,\-–—]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const meaningful = words.filter(
    (w) => !/^\d+$/.test(w) && w.length > 2 && !NON_TOPONIMO.has(w.toLowerCase())
  )

  // Prima la stringa intera (utile se è già una città), poi le parole
  // significative dall'ultima alla prima (senza duplicati).
  const candidates: string[] = [trimmed]
  for (let i = meaningful.length - 1; i >= 0; i--) {
    if (!candidates.includes(meaningful[i])) candidates.push(meaningful[i])
  }

  for (const candidate of candidates) {
    const result = await geocodeQuery(candidate)
    if (result) return result
  }
  return null
}

export async function getMatchWeather(
  field: string,
  matchDate: string,
  matchTime?: string | null,
): Promise<WeatherForecast | null> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${matchDate}T00:00:00`)
  const daysAhead = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (daysAhead < 0 || daysAhead > 16) return null

  const place = await geocodeField(field)
  if (!place) return null

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&hourly=weather_code,precipitation_probability` +
      `&timezone=auto&start_date=${matchDate}&end_date=${matchDate}`
  )
  if (!res.ok) return null
  const data = await res.json()
  const daily = data?.daily
  if (!daily?.weather_code?.length) return null

  let weatherCode: number = daily.weather_code[0]
  let precipitationProbability: number | null = daily.precipitation_probability_max?.[0] ?? null

  // Se si conosce l'ora della partita, usa la previsione di QUELL'ORA: il
  // codice giornaliero rappresenta il fenomeno più severo dell'intera
  // giornata (es. un temporale al mattino), fuorviante per una partita serale.
  if (matchTime) {
    const hour = matchTime.slice(0, 2)
    const hourly = data?.hourly
    const idx = hourly?.time?.findIndex((t: string) => t === `${matchDate}T${hour}:00`) ?? -1
    if (idx >= 0) {
      weatherCode = hourly.weather_code[idx]
      precipitationProbability = hourly.precipitation_probability?.[idx] ?? precipitationProbability
    }
  }

  return {
    weatherCode,
    tempMax: daily.temperature_2m_max[0],
    tempMin: daily.temperature_2m_min[0],
    precipitationProbability,
    locationName: place.name,
  }
}
