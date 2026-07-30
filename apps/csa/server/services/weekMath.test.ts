import { describe, it, expect, afterEach, vi } from 'vitest'
import { getWeekIndexFromDate, isFixoWeekFromDate } from './weekMath'
import { getWeekIndex, isFixoWeek } from '../../src/lib/weekUtils'

afterEach(() => {
  vi.unstubAllEnvs()
})

function segundas(de: string, ate: string): string[] {
  const out: string[] = []
  const [y, m, d] = de.split('-').map(Number)
  const cur = new Date(Date.UTC(y, m - 1, d))
  const fim = new Date(`${ate}T00:00:00Z`)
  while (cur < fim) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 7)
  }
  return out
}

// O server monta a Date a partir de componentes locais (new Date(y, m, d)), como faz o
// countDeliveryWeeks; o client parseia a string. Os dois têm que chegar no mesmo lugar.
function comoOServerMonta(weekStart: string): Date {
  const [y, m, d] = weekStart.split('-').map(Number)
  return new Date(y, m - 1, d)
}

describe('weekMath do server x weekUtils do client', () => {
  // O #43 nasceu de client e server discordarem: a UI dizia "não pega nesta semana" e a
  // cobrança contava a semana. Enquanto a regra estiver duplicada (#18), este teste é o
  // que impede a divergência de voltar.
  it.each(['America/Sao_Paulo', 'UTC'])('concordam semana a semana em %s (2025–2033)', (tz) => {
    vi.stubEnv('TZ', tz)
    const todas = segundas('2025-12-29', '2033-12-26')
    expect(todas.length).toBeGreaterThan(400)
    for (const ws of todas) {
      const date = comoOServerMonta(ws)
      expect(getWeekIndexFromDate(date), `índice divergiu em ${ws} (${tz})`).toBe(
        getWeekIndex(ws),
      )
      expect(isFixoWeekFromDate(date), `semana de fixo divergiu em ${ws} (${tz})`).toBe(
        isFixoWeek(ws),
      )
    }
  })

  it('usa a mesma âncora do client', () => {
    expect(getWeekIndexFromDate(comoOServerMonta('2025-12-29'))).toBe(0)
  })

  it('alterna de 2 em 2 na virada 2026→2027', () => {
    expect(isFixoWeekFromDate(comoOServerMonta('2026-12-28'))).toBe(true)
    expect(isFixoWeekFromDate(comoOServerMonta('2027-01-04'))).toBe(false)
    expect(isFixoWeekFromDate(comoOServerMonta('2027-01-11'))).toBe(true)
  })
})
