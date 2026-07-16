// Espelho de `src/lib/weekUtils.ts` para o backend.
//
// O rootDir do tsconfig do server impede importar de `src/` hoje, então a regra do ciclo
// quinzenal vive duplicada. `weekMath.test.ts` compara as duas implementações semana a
// semana — se divergirem, o teste quebra. Divergência aqui é cara: foi exatamente o que
// gerou o #43 (a UI dizia "não pega" e a cobrança contava a semana).
//
// A unificação sai no #18.

// Âncora do ciclo quinzenal: segunda-feira da semana ISO 1 de 2026.
// Única escolha (mod 2) que preserva a paridade que vigorava antes do #48.
const ANCORA_QUINZENAL = Date.UTC(2025, 11, 29)
const UMA_SEMANA_MS = 7 * 86400000

// Contador contínuo de semanas desde a âncora. Não usa número de semana ISO: a semana ISO
// reseta todo ano e em ano de 53 semanas (2026, 2032...) a paridade repete na virada (#48).
export function getWeekIndexFromDate(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((utc - ANCORA_QUINZENAL) / UMA_SEMANA_MS)
}

// Semana de fixo = índice par. Módulo protegido: índice é negativo antes da âncora.
export function isFixoWeekFromDate(date: Date): boolean {
  const i = getWeekIndexFromDate(date)
  return ((i % 2) + 2) % 2 === 0
}
