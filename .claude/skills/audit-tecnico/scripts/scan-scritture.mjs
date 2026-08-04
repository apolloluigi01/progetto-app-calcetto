/**
 * Trova le scritture verso Supabase che NON controllano l'esito.
 *
 * Una insert/update/upsert/delete il cui errore viene ignorato fa proseguire
 * l'interfaccia come se fosse andato tutto bene: l'utente vede "salvato" e sul
 * server non è arrivato niente. È il controllo che su questo progetto ha
 * prodotto il rilievo più importante (30 scritture su 66, 23 in un solo file).
 *
 *   node .claude/skills/audit-tecnico/scripts/scan-scritture.mjs [cartella]
 *
 * Considera "controllata" una scrittura che ha `error` o una funzione `run(`
 * nelle righe immediatamente circostanti. È un'euristica: le poche voci in
 * uscita vanno lette a mano prima di finire nel report — righe commentate e
 * operazioni volutamente accessorie (log, pulizia di un avviso) non sono rilievi.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? 'src'
const WRITE_OP = /\.(insert|upsert|update|delete)\(/
const SOURCE_FILE = /\.(ts|tsx)$/

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (SOURCE_FILE.test(entry.name)) out.push(full)
  }
  return out
}

let total = 0
const findings = []

for (const file of walk(root)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (!WRITE_OP.test(line)) return
    // Deve trattarsi davvero di una query Supabase e non di un metodo omonimo
    // su una struttura dati (Set, Map, array).
    const before = lines.slice(Math.max(0, i - 4), i + 1).join(' ')
    if (!/supabase|\.from\(/.test(before)) return

    total++
    const context = lines.slice(Math.max(0, i - 5), i + 3).join(' ')
    if (/error|run\(/i.test(context)) return

    findings.push({ file, line: i + 1, code: line.trim().slice(0, 90) })
  })
}

console.log(`scritture totali: ${total} | senza controllo dell'esito: ${findings.length}`)

if (findings.length > 0) {
  const perFile = {}
  for (const f of findings) perFile[f.file] = (perFile[f.file] ?? 0) + 1
  console.log('\nper file:')
  for (const [file, n] of Object.entries(perFile).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${file}`)
  }
  console.log('\ndettaglio:')
  for (const f of findings) console.log(`  ${f.file}:${f.line}  ${f.code}`)
}
