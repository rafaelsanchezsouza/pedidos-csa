export function getWeekStart(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export function getISOWeekNumber(weekStart: string): number {
  const date = new Date(weekStart)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Convenção: semanas ímpares = semana de fixo para usuários quinzenais
export function isFixoWeek(weekStart: string): boolean {
  return getISOWeekNumber(weekStart) % 2 === 1
}

export function weekOptions(count = 8): string[] {
  const weeks: string[] = []
  const d = new Date()
  for (let i = 0; i < count; i++) {
    weeks.push(getWeekStart(d))
    d.setDate(d.getDate() - 7)
  }
  return weeks
}
