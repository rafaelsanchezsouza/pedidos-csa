// Parser de uma linha CSV respeitando aspas e vírgulas escapadas ("" => ").
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { field += c }
    } else {
      if (c === '"') { inQuotes = true }
      else if (c === ',') { fields.push(field); field = '' }
      else { field += c }
    }
  }
  fields.push(field)
  return fields
}

// Converte preço em texto (ex.: "R$ 1,20", "12.00", "1.234,50") para número.
export function parsePrice(raw: string): number {
  let s = raw.replace(/[^\d.,-]/g, '').trim()
  if (s.includes(',')) {
    // vírgula = separador decimal BR; remove pontos de milhar
    s = s.replace(/\./g, '').replace(',', '.')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/**
 * Data no formato brasileiro do Google Forms ('15/08/2026') para ISO ('2026-08-15').
 * Devolve null para vazio ou malformado — no import, campo ruim vira "sem informação",
 * nunca uma data inventada que decidiria ciclo de entrega errado.
 *
 * Parseia os componentes na mão: `new Date('15/08/2026')` é interpretação do runtime
 * (nos EUA seria mês/dia) e `new Date('2026-08-15')` resolve para meia-noite UTC, que em
 * fuso negativo recua um dia — os dois erros que já custaram o #43.
 */
export function parseDataBR(raw: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw ?? '')
  if (!m) return null
  const [, d, mes, ano] = m.map(Number) as [number, number, number, number]
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null
  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  // Rejeita 31/02 e afins: o Date normalizaria para 03/03 em silêncio.
  const check = new Date(Date.UTC(ano, mes - 1, d))
  return check.toISOString().slice(0, 10) === iso ? iso : null
}
