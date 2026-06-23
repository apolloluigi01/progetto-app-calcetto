import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../src/assets/pwa-icon.svg', import.meta.url))
const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url))

await mkdir(outDir, { recursive: true })

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

for (const { name, size } of targets) {
  await sharp(src, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(`${outDir}${name}`)
  console.log(`generated ${name}`)
}

// Maskable icon: same artwork with extra padding so OS masks don't clip it.
await sharp(src, { density: 384 })
  .resize(Math.round(512 * 0.8), Math.round(512 * 0.8))
  .extend({
    top: Math.round(512 * 0.1),
    bottom: Math.round(512 * 0.1),
    left: Math.round(512 * 0.1),
    right: Math.round(512 * 0.1),
    background: '#1b5e20',
  })
  .png()
  .toFile(`${outDir}icon-512-maskable.png`)
console.log('generated icon-512-maskable.png')
