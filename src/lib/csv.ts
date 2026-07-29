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
