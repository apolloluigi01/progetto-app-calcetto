/**
 * Esporta i dati di una tabella in CSV e ne avvia il download (o la
 * condivisione file su mobile). Il formato è pensato per aprirsi correttamente
 * in Excel: separatore ';' (atteso dalla localizzazione italiana), BOM UTF-8
 * per gli accenti e fine riga CRLF.
 */

function escapeCell(value: string): string {
  const v = value ?? ''
  // Le celle che contengono il separatore, virgolette o a-capo vanno racchiuse
  // tra virgolette; le virgolette interne si raddoppiano.
  if (/[";\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(';'))
  // BOM UTF-8 + CRLF: Excel apre correttamente accenti e righe.
  return '﻿' + lines.join('\r\n')
}

/** Rende sicuro un nome file (via separatori e caratteri non ammessi). */
function safeFilename(name: string): string {
  const base = name.replace(/[\\/:*?"<>|]/g, '-').trim()
  return base.toLowerCase().endsWith('.csv') ? base : `${base}.csv`
}

/**
 * True solo su dispositivi mobili. Su desktop la condivisione file di sistema
 * (Windows/macOS) apre canali come la mail invece di salvare in locale, quindi
 * lì si usa sempre il download classico su disco.
 */
function isMobileDevice(): boolean {
  if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    return true
  }
  if (typeof matchMedia === 'function') {
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches
  }
  return false
}

export async function downloadCsv(
  filename: string,
  headers: string[],
  rows: string[][],
): Promise<void> {
  const csv = buildCsv(headers, rows)
  const name = safeFilename(filename)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })

  // Solo su mobile, se disponibile, usa la condivisione file nativa ("Salva su
  // File" / "Condividi"). Su desktop si va sempre di download su disco.
  const file = new File([blob], name, { type: 'text/csv' })
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
  if (isMobileDevice() && typeof navigator.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (err) {
      // L'utente ha annullato: non forziamo anche il download.
      if ((err as Error)?.name === 'AbortError') return
      // Altro errore (condivisione non permessa): si prosegue col download.
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
