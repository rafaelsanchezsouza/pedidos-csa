import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getISOWeekNumber,
  isFixoWeek,
  isUserDeliveryWeek,
  getWeekStart,
  getWeekDelivery,
  shiftWeek,
} from './weekUtils'

// Ground truth conferido com `date -d <data> +%V` (coreutils), não com a própria implementação.
const SEMANAS_ISO: Array<[string, number]> = [
  ['2025-12-29', 1],  // semana 1 de 2026 começa ainda em dezembro
  ['2026-01-05', 2],
  ['2026-07-06', 28],
  ['2026-07-13', 29],
  ['2026-07-20', 30],
  ['2026-07-27', 31],
  ['2026-12-28', 53], // 2026 é ano ISO de 53 semanas
  ['2027-01-04', 1],
]

function comTZ(tz: string) {
  vi.stubEnv('TZ', tz)
}
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getISOWeekNumber', () => {
  it.each(SEMANAS_ISO)('%s → semana ISO %i', (weekStart, esperado) => {
    expect(getISOWeekNumber(weekStart)).toBe(esperado)
  })

  // Regressão #43: weekStart era parseado como UTC e lido com getters locais.
  // Em qualquer fuso negativo (BR) a data recuava um dia → semana ISO off-by-one → paridade invertida.
  it.each(['America/Sao_Paulo', 'UTC', 'Pacific/Kiritimati', 'America/Anchorage'])(
    'independe do fuso do navegador (%s)',
    (tz) => {
      comTZ(tz)
      for (const [weekStart, esperado] of SEMANAS_ISO) {
        expect(getISOWeekNumber(weekStart), `${weekStart} em ${tz}`).toBe(esperado)
      }
    },
  )
})

describe('isFixoWeek', () => {
  it('semana ISO ímpar = semana de fixo', () => {
    expect(isFixoWeek('2026-07-13')).toBe(true)  // 29
    expect(isFixoWeek('2026-07-06')).toBe(false) // 28
  })
})

describe('isUserDeliveryWeek', () => {
  const semanal = { frequency: 'semanal' as const }
  const impar = { frequency: 'quinzenal' as const, quinzenalParity: 'impar' as const }
  const par = { frequency: 'quinzenal' as const, quinzenalParity: 'par' as const }

  it('semanal recebe toda semana', () => {
    for (const [weekStart] of SEMANAS_ISO) {
      expect(isUserDeliveryWeek(semanal, weekStart)).toBe(true)
    }
  })

  // BUSINESS_RULES.md: impar = recebe em semanas ISO ímpares; par = em semanas pares.
  it('quinzenal impar recebe só em semana ISO ímpar', () => {
    expect(isUserDeliveryWeek(impar, '2026-07-13')).toBe(true)  // 29
    expect(isUserDeliveryWeek(impar, '2026-07-20')).toBe(false) // 30
    expect(isUserDeliveryWeek(impar, '2026-07-27')).toBe(true)  // 31
  })

  it('quinzenal par recebe só em semana ISO par', () => {
    expect(isUserDeliveryWeek(par, '2026-07-13')).toBe(false)
    expect(isUserDeliveryWeek(par, '2026-07-20')).toBe(true)
    expect(isUserDeliveryWeek(par, '2026-07-27')).toBe(false)
  })

  it('quinzenal e semanal nunca coincidem em não-entrega: impar e par se alternam', () => {
    for (const [weekStart] of SEMANAS_ISO) {
      expect(isUserDeliveryWeek(impar, weekStart)).not.toBe(isUserDeliveryWeek(par, weekStart))
    }
  })

  it('sem paridade definida cai no comportamento global (semanas ímpares)', () => {
    const semParidade = { frequency: 'quinzenal' as const }
    expect(isUserDeliveryWeek(semParidade, '2026-07-13')).toBe(true)
    expect(isUserDeliveryWeek(semParidade, '2026-07-20')).toBe(false)
  })

  // Caso do #43: Ana (impar) na semana de 13/07/2026 (ISO 29, ímpar) recebe cesta.
  // O bug de fuso fazia a UI calcular semana 28 (par) e dizer "não pega nesta semana",
  // enquanto o servidor (UTC) cobrava a semana. Daí "gerou um valor a mais".
  it('regressão #43: quinzenal impar recebe em 2026-07-13 e 2026-07-27', () => {
    comTZ('America/Sao_Paulo')
    expect(isUserDeliveryWeek(impar, '2026-07-13')).toBe(true)
    expect(isUserDeliveryWeek(impar, '2026-07-27')).toBe(true)
  })
})

describe('getWeekStart', () => {
  it('devolve a segunda da semana', () => {
    expect(getWeekStart(new Date(2026, 6, 15))).toBe('2026-07-13') // quarta
    expect(getWeekStart(new Date(2026, 6, 13))).toBe('2026-07-13') // a própria segunda
  })

  it('domingo pertence à semana que começou na segunda anterior', () => {
    expect(getWeekStart(new Date(2026, 6, 19))).toBe('2026-07-13')
  })

  it('atravessa virada de mês', () => {
    expect(getWeekStart(new Date(2026, 7, 1))).toBe('2026-07-27') // sáb 01/08
  })
})

describe('getWeekDelivery', () => {
  it('entrega é a quarta da semana', () => {
    expect(getWeekDelivery('2026-07-13')).toBe('2026-07-15')
  })

  it('atravessa virada de mês', () => {
    expect(getWeekDelivery('2026-07-27')).toBe('2026-07-29')
    expect(getWeekDelivery('2026-08-31')).toBe('2026-09-02')
  })
})

describe('shiftWeek', () => {
  it('avança e retrocede semanas', () => {
    expect(shiftWeek('2026-07-13', 1)).toBe('2026-07-20')
    expect(shiftWeek('2026-07-13', -1)).toBe('2026-07-06')
    expect(shiftWeek('2026-07-13', 0)).toBe('2026-07-13')
  })

  it('atravessa virada de ano', () => {
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04')
  })
})
