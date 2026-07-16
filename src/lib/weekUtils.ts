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

export function getISOWeekNumber(weekStart: string): number {
  // weekStart é 'YYYY-MM-DD'. Parseamos os componentes na mão: `new Date('YYYY-MM-DD')`
  // resolve para meia-noite UTC e, lido com getters locais em fuso negativo (BR),
  // recua um dia — o que invertia a paridade quinzenal de todo mundo (#43).
  const [year, month, day] = weekStart.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Convenção: semanas ímpares = semana de fixo para usuários quinzenais sem ciclo definido
export function isFixoWeek(weekStart: string): boolean {
  return getISOWeekNumber(weekStart) % 2 === 1
}

// Determina se a semana é de entrega para o usuário considerando seu ciclo individual
export function isUserDeliveryWeek(
  user: { frequency: 'semanal' | 'quinzenal'; quinzenalParity?: 'par' | 'impar' },
  weekStart: string
): boolean {
  if (user.frequency === 'semanal') return true
  const odd = isFixoWeek(weekStart)
  if (user.quinzenalParity === 'impar') return odd
  if (user.quinzenalParity === 'par') return !odd
  return odd // fallback: comportamento global (semanas ímpares)
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
