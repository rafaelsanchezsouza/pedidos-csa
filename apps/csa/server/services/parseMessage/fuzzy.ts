import type { ExistingProduct, ParsedProduct, MessageParser } from './types.js'

// --- string utils ---

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  const dist = levenshtein(na, nb)
  return 1 - dist / Math.max(na.length, nb.length)
}

function bestMatch(name: string, products: ExistingProduct[]): string | undefined {
  let best: { id: string; score: number } | undefined

  for (const p of products) {
    const score = similarity(name, p.name)

    if (score >= 0.7 && (!best || score > best.score)) {
      best = { id: p.id, score }
    }
  }

  return best?.id
}

// --- line parser ---

const KNOWN_UNITS = ['kg', 'unid', 'maco', 'maço', 'palma', 'bandeja', 'litro', 'lt', 'g', 'dz', 'cx', 'cacho', 'pe', 'pé']

interface LineResult {
  name: string
  unit: string
  price: number
}

function parseLine(raw: string): LineResult | null {
  let line = raw.trim().replace(/\.$/, '').trim()
  if (!line) return null

  // Skip greetings and section headers
  if (/^(bom\s+dia|boa\s+tarde|boa\s+noite|os\s+alimentos|extra\s+valor|valor\s+em)/i.test(line)) return null

  let price = 0
  let unit = 'unid'

  // 1. Extract price — try patterns in order of specificity
  const pricePatterns: RegExp[] = [
    /\(\s*R?\$?\s*(\d+[.,]\d+)\s*\)/,      // (1.50) or ( R$1.50 )
    /R\$\s*(\d+[.,]\d+)/,                   // R$3.50 or R$ 3.50
    /(\d+[.,]\d+)\s*(?:reais)?\s*$/i,       // 3.50 or 3.50 reais at end
    /\b(\d+[.,]\d+)\b/,                     // any decimal number
  ]

  for (const pattern of pricePatterns) {
    const m = line.match(pattern)
    if (m) {
      price = parseFloat(m[1].replace(',', '.'))
      line = line.replace(m[0], '').trim()
      break
    }
  }

  // 2. Extract unit — parens first (only if content is a known unit)
  const unitInParens = line.match(/\(\s*([a-zA-Z\u00C0-\u024F]+)\s*\)/)
  if (unitInParens && KNOWN_UNITS.includes(normalize(unitInParens[1]))) {
    unit = normalize(unitInParens[1])
    line = line.replace(unitInParens[0], '').trim()
  } else {
    // Known unit as standalone word — NOT at the very start (to avoid stripping "Bandeja de jaca")
    const unitRegex = new RegExp(`\\s(${KNOWN_UNITS.join('|')})(?:\\s|$)`, 'i')
    const unitMatch = line.match(unitRegex)
    if (unitMatch) {
      unit = normalize(unitMatch[1])
      line = line.replace(unitMatch[0], ' ').trim()
    }
  }

  // 3. Clean up name: remove lone digits, empty parens, extra spaces
  const name = line
    .replace(/\(\s*\)/g, '')
    .replace(/\s+\d+\s*$/, '')
    .replace(/^\s*\d+\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!name) return null

  // Capitalize first letter
  const displayName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()

  return { name: displayName, unit, price }
}

// --- section detection ---

type Section = 'fixo' | 'extra'

function detectAllExtra(message: string): boolean {
  const firstLines = message.split('\n').slice(0, 3).join(' ')
  return /\bextra\b/i.test(firstLines) || /boa\s+tarde.*extra/i.test(firstLines)
}

function parseWithSections(lines: string[]): Array<{ raw: string; type: Section }> {
  const results: Array<{ raw: string; type: Section }> = []
  let current: Section = 'extra'

  for (const line of lines) {
    if (/alimentos\s+dispon/i.test(line)) { current = 'fixo'; continue }
    if (/alimentos\s+estra|alimentos\s+extra/i.test(line)) { current = 'extra'; continue }
    results.push({ raw: line, type: current })
  }

  return results
}

// --- main parser ---

export const parseProducerMessage: MessageParser = async (rawMessage, existingProducts) => {
  const lines = rawMessage.split('\n')
  const allExtra = detectAllExtra(rawMessage)
  const hasSections = /alimentos\s+dispon/i.test(rawMessage)

  let lineEntries: Array<{ raw: string; type: Section }>

  if (allExtra || !hasSections) {
    lineEntries = lines.map((raw) => ({ raw, type: 'extra' as Section }))
  } else {
    lineEntries = parseWithSections(lines)
  }

  const results: ParsedProduct[] = []

  for (const { raw, type } of lineEntries) {
    const parsed = parseLine(raw)
    if (!parsed) continue

    const matchedProductId = bestMatch(parsed.name, existingProducts)

    results.push({
      name: parsed.name,
      unit: parsed.unit,
      price: parsed.price,
      type,
      ...(matchedProductId ? { matchedProductId } : {}),
    })
  }

  return results
}
