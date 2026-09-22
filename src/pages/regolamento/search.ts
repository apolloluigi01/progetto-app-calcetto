/*
 * Ricerca nel regolamento. Il testo delle sezioni è JSX sparso in tre file,
 * quindi la ricerca lavora sul DOM già disegnato: nasconde le sezioni che non
 * contengono le parole cercate, apre quelle che le contengono ed evidenzia le
 * occorrenze con la CSS Custom Highlight API, che colora il testo senza
 * toccare il DOM gestito da React.
 */

const HIGHLIGHT_NAME = 'regolamento-search'

/** Minuscolo, senza accenti e con l'apostrofo tipografico uniformato. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
}

/** Parole della ricerca (almeno 2 caratteri ciascuna, per non trovare tutto). */
export function searchTerms(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter((t) => t.length >= 2)
}

/**
 * Come normalize, ma ricorda per ogni carattere normalizzato la posizione nel
 * testo originale: serve a evidenziare il punto giusto anche con gli accenti.
 */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    for (const ch of normalize(text[i])) {
      norm += ch
      map.push(i)
    }
  }
  return { norm, map }
}

function highlightSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

export function clearHighlights() {
  if (highlightSupported()) CSS.highlights.delete(HIGHLIGHT_NAME)
}

function highlightTerms(roots: Element[], terms: string[]) {
  if (!highlightSupported()) return
  const ranges: Range[] = []
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      if (!text.trim()) continue
      const { norm, map } = normalizeWithMap(text)
      for (const term of terms) {
        for (let at = norm.indexOf(term); at !== -1; at = norm.indexOf(term, at + term.length)) {
          const range = document.createRange()
          range.setStart(node, map[at])
          range.setEnd(node, map[at + term.length - 1] + 1)
          ranges.push(range)
        }
      }
    }
  }
  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges))
}

/**
 * Applica la ricerca alle sezioni dentro `container` e restituisce quante ne
 * corrispondono. Una sezione corrisponde se contiene tutte le parole cercate,
 * nel titolo o nel testo. Con la ricerca vuota tutto torna com'era.
 */
export function applySearch(container: HTMLElement, terms: string[]): number {
  const sections = [...container.querySelectorAll<HTMLDetailsElement>('details[data-rule-section]')]
  let count = 0
  const matched: HTMLDetailsElement[] = []

  for (const section of sections) {
    if (terms.length === 0) {
      section.hidden = false
      // Richiude solo le sezioni aperte dalla ricerca, non quelle aperte a mano.
      if (section.dataset.openedBySearch) {
        section.open = false
        delete section.dataset.openedBySearch
      }
      continue
    }
    const text = normalize(section.textContent ?? '')
    const isMatch = terms.every((t) => text.includes(t))
    section.hidden = !isMatch
    if (isMatch) {
      count++
      matched.push(section)
      if (!section.open) {
        section.open = true
        section.dataset.openedBySearch = '1'
      }
    }
  }

  // Gruppi (un regolamento intero) senza risultati: spariscono anche i titoli.
  for (const group of container.querySelectorAll<HTMLElement>('[data-rule-group]')) {
    group.hidden = terms.length > 0 && !group.querySelector('details[data-rule-section]:not([hidden])')
  }

  clearHighlights()
  if (terms.length > 0) highlightTerms(matched, terms)
  return count
}
