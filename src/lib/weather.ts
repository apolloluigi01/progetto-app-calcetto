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

async function geocodeField(query: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=it&format=json`
  )
  if (!res.ok) return null
  const data = await res.json()
  const result = data?.results?.[0]
  if (!result) return null
  return { lat: result.latitude, lon: result.longitude, name: result.name }
}

export async function getMatchWeather(field: string, matchDate: string): Promise<WeatherForecast | null> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(matchDate)
  const daysAhead = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (daysAhead < 0 || daysAhead > 15) return null

  const place = await geocodeField(field)
  if (!place) return null

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&start_date=${matchDate}&end_date=${matchDate}`
  )
  if (!res.ok) return null
  const data = await res.json()
  const daily = data?.daily
  if (!daily?.weather_code?.length) return null

  return {
    weatherCode: daily.weather_code[0],
    tempMax: daily.temperature_2m_max[0],
    tempMin: daily.temperature_2m_min[0],
    precipitationProbability: daily.precipitation_probability_max?.[0] ?? null,
    locationName: place.name,
  }
}
