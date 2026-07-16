export function getWeekStart(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Âncora do ciclo quinzenal: segunda-feira da semana ISO 1 de 2026.
// A escolha não é livre — é a única (mod 2) que reproduz exatamente a paridade ISO que
// vigorava antes do #48, então nenhum membro muda de semana ao migrar para o contador.
const ANCORA_QUINZENAL = Date.UTC(2025, 11, 29)
const UMA_SEMANA_MS = 7 * 86400000

// Conta as semanas desde a âncora. Contador contínuo em vez do número da semana ISO: a
// semana ISO reseta todo ano e, em ano de 53 semanas (2026, 2032...), a paridade repete na
// virada — dois ciclos "ímpares" seguidos quebravam a alternância quinzenal (#48).
//
// weekStart é 'YYYY-MM-DD' e os componentes são parseados na mão: `new Date('YYYY-MM-DD')`
// resolve para meia-noite UTC e, lido com getters locais em fuso negativo (BR), recua um
// dia — era o que invertia a paridade de todo mundo (#43).
export function getWeekIndex(weekStart: string): number {
  const [year, month, day] = weekStart.split('-').map(Number)
  return Math.round((Date.UTC(year, month - 1, day) - ANCORA_QUINZENAL) / UMA_SEMANA_MS)
}

// Semana de fixo = índice par. Vale para quinzenais sem ciclo definido (fallback).
// Módulo protegido: semanas anteriores à âncora dão índice negativo e `-1 % 2` é -1 em JS.
export function isFixoWeek(weekStart: string): boolean {
  const i = getWeekIndex(weekStart)
  return ((i % 2) + 2) % 2 === 0
}

// Determina se a semana é de entrega para o usuário considerando seu ciclo individual
export function isUserDeliveryWeek(
  user: { frequency: 'semanal' | 'quinzenal'; quinzenalParity?: 'par' | 'impar' },
  weekStart: string
): boolean {
  if (user.frequency === 'semanal') return true
  const fixo = isFixoWeek(weekStart)
  if (user.quinzenalParity === 'impar') return fixo
  if (user.quinzenalParity === 'par') return !fixo
  return fixo // fallback: comportamento global
}

// Retorna a quarta-feira da semana (dia de entrega) a partir do weekStart (segunda)
export function getWeekDelivery(weekStart: string): string {
  const d = new Date(weekStart + 'T12:00:00')
  d.setDate(d.getDate() + 2)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Semana presente. Se hoje é weekChangeDay, avança para a próxima segunda (mostra semana seguinte).
// weekChangeDay: 0=Dom (padrão), 1=Seg, ..., 6=Sáb
export function getPresentWeekId(weekChangeDay = 0): string {
  const d = new Date()
  if (d.getDay() === weekChangeDay) {
    const daysToNextMonday = ((1 - d.getDay() + 7) % 7) || 7
    d.setDate(d.getDate() + daysToNextMonday)
  }
  return getWeekStart(d)
}

export function shiftWeek(weekStart: string, delta: number): string {
  const d = new Date(weekStart + 'T12:00:00')
  d.setDate(d.getDate() + delta * 7)
  return getWeekStart(d)
}

export function formatDeliveryDate(weekStart: string): string {
  const delivery = getWeekDelivery(weekStart)
  const [, m, d] = delivery.split('-')
  return `${d}/${m}`
}

export function weekOptions(count = 8): string[] {
  const weeks: string[] = []
  const start = new Date(getPresentWeekId() + 'T12:00:00')
  for (let i = 0; i < count; i++) {
    weeks.push(getWeekStart(start))
    start.setDate(start.getDate() - 7)
  }
  return weeks
}
