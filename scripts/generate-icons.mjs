import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Sorgente: logo "pavone calciatore" 1024x1024 con bordo nero e angoli
// arrotondati disegnati nell'artwork. Le icone sono versionate (-v2) per
// invalidare la cache dei client che hanno già installato la PWA.
const src = fileURLToPath(new URL('../src/assets/pavone_logo_v2.png', import.meta.url))
const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url))

await mkdir(outDir, { recursive: true })

// 1) Via il bordo nero uniforme attorno all'artwork.
const trimmed = await sharp(src).trim({ background: '#000000', threshold: 25 }).png().toBuffer()
const meta = await sharp(trimmed).metadata()
const base = Math.min(meta.width, meta.height)
const squared = await sharp(trimmed).resize(base, base, { fit: 'cover' }).png().toBuffer()

// Maschera ad angoli arrotondati: rende trasparente il nero residuo negli
// angoli (raggio leggermente più ampio di quello dell'artwork).
function roundedMask(size, radiusRatio = 0.24) {
  const r = Math.round(size * radiusRatio)
  return Buffer.from(
    `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  )
}

async function rounded(size) {
  return sharp(squared)
    .resize(size, size)
    .composite([{ input: roundedMask(size), blend: 'dest-in' }])
    .png()
    .toBuffer()
}

// Icone standard e logo in-app: angoli trasparenti.
const targets = [
  { name: 'icon-192-v2.png', size: 192 },
  { name: 'icon-512-v2.png', size: 512 },
  { name: 'pavone_logo-v2.png', size: 512 },
  { name: 'favicon-v2.png', size: 64 },
]
for (const { name, size } of targets) {
  await sharp(await rounded(size)).png().toFile(`${outDir}${name}`)
  console.log(`generated ${name}`)
}

// Apple touch icon: iOS non gestisce la trasparenza (diventerebbe nera),
// quindi si appiattisce sul verde del tema.
await sharp(await rounded(180))
  .flatten({ background: '#1b5e20' })
  .png()
  .toFile(`${outDir}apple-touch-icon-v2.png`)
console.log('generated apple-touch-icon-v2.png')

// Maskable: contenuto all'80% su fondo pieno, così le maschere di sistema
// (cerchio, squircle...) non tagliano il soggetto.
const inner = Math.round(512 * 0.8)
await sharp(await rounded(inner))
  .extend({
    top: Math.round((512 - inner) / 2),
    bottom: 512 - inner - Math.round((512 - inner) / 2),
    left: Math.round((512 - inner) / 2),
    right: 512 - inner - Math.round((512 - inner) / 2),
    background: '#1b5e20',
  })
  .flatten({ background: '#1b5e20' })
  .png()
  .toFile(`${outDir}icon-512-maskable-v2.png`)
console.log('generated icon-512-maskable-v2.png')
