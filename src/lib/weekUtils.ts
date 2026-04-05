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
  const date = new Date(weekStart)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
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

// Semana presente usando domingo como início (se hoje é domingo, semana começa na próxima segunda)
export function getPresentWeekId(): string {
  const d = new Date()
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
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
