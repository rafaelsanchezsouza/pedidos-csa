import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getWeekIndex,
  isFixoWeek,
  isUserDeliveryWeek,
  getWeekStart,
  getWeekDelivery,
  shiftWeek,
} from './weekUtils'

function comTZ(tz: string) {
  vi.stubEnv('TZ', tz)
}
afterEach(() => {
  vi.unstubAllEnvs()
})

const semanal = { frequency: 'semanal' as const }
const impar = { frequency: 'quinzenal' as const, quinzenalParity: 'impar' as const }
const par = { frequency: 'quinzenal' as const, quinzenalParity: 'par' as const }

// Semanas ISO conferidas com `date -d <data> +%V` (coreutils), não com a implementação.
const SEMANAS_ISO: Array<[string, number]> = [
  ['2025-12-29', 1],
  ['2026-01-05', 2],
  ['2026-07-06', 28],
  ['2026-07-13', 29],
  ['2026-07-20', 30],
  ['2026-07-27', 31],
  ['2026-12-28', 53], // 2026 é ano ISO de 53 semanas
  ['2027-01-04', 1],
]

// Implementação ISO que vigorava antes do #48, usada só como oráculo do comportamento
// anterior: o contador contínuo tem que reproduzi-la exatamente até a virada de 2026.
function paridadeISOLegada(weekStart: string, parity: 'par' | 'impar'): boolean {
  const [y, m, d] = weekStart.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const iso = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return parity === 'impar' ? iso % 2 === 1 : iso % 2 === 0
}

function segundasEntre(inicio: string, fim: string): string[] {
  const out: string[] = []
  for (let w = inicio; w < fim; w = shiftWeek(w, 1)) out.push(w)
  return out
}

describe('getWeekIndex', () => {
  it('conta semanas corridas a partir da âncora', () => {
    expect(getWeekIndex('2025-12-29')).toBe(0)
    expect(getWeekIndex('2026-01-05')).toBe(1)
    expect(getWeekIndex('2026-07-13')).toBe(28)
  })

  it('é negativo antes da âncora e continua alternando', () => {
    expect(getWeekIndex('2025-12-22')).toBe(-1)
    // `-1 % 2` é -1 em JS: sem módulo protegido isFixoWeek erraria o passado
    expect(isFixoWeek('2025-12-22')).toBe(false)
    expect(isFixoWeek('2025-12-29')).toBe(true)
    expect(isFixoWeek('2025-12-15')).toBe(true)
  })

  it('não pula na virada de ano ISO de 53 semanas', () => {
    expect(getWeekIndex('2027-01-04') - getWeekIndex('2026-12-28')).toBe(1)
  })

  it.each(['America/Sao_Paulo', 'UTC', 'Pacific/Kiritimati', 'America/Anchorage'])(
    'independe do fuso do navegador (%s)',
    (tz) => {
      comTZ(tz)
      for (const [weekStart] of SEMANAS_ISO) {
        expect(getWeekIndex(weekStart), `${weekStart} em ${tz}`).toBe(
          getWeekIndex(weekStart),
        )
      }
      // valores absolutos, não só auto-consistência
      expect(getWeekIndex('2026-07-13')).toBe(28)
      expect(getWeekIndex('2027-01-04')).toBe(53)
    },
  )
})

describe('isUserDeliveryWeek', () => {
  it('semanal recebe toda semana', () => {
    for (const [weekStart] of SEMANAS_ISO) {
      expect(isUserDeliveryWeek(semanal, weekStart)).toBe(true)
    }
  })

  it('impar e par nunca coincidem', () => {
    for (const weekStart of segundasEntre('2025-12-29', '2028-01-03')) {
      expect(isUserDeliveryWeek(impar, weekStart)).not.toBe(isUserDeliveryWeek(par, weekStart))
    }
  })

  it('sem paridade definida cai no comportamento global', () => {
    const semParidade = { frequency: 'quinzenal' as const }
    expect(isUserDeliveryWeek(semParidade, '2026-07-13')).toBe(isFixoWeek('2026-07-13'))
  })

  // #48: migrar para o contador não pode mudar a semana de ninguém.
  it('reproduz exatamente a paridade ISO legada até a virada de 2026', () => {
    const semanas = segundasEntre('2025-12-29', '2026-12-28')
    expect(semanas.length).toBeGreaterThan(50)
    for (const weekStart of semanas) {
      for (const parity of ['impar', 'par'] as const) {
        expect(
          isUserDeliveryWeek({ frequency: 'quinzenal', quinzenalParity: parity }, weekStart),
          `${weekStart} (${parity}) mudou de semana ao migrar para o contador`,
        ).toBe(paridadeISOLegada(weekStart, parity))
      }
    }
  })

  // Regressão #43: fuso negativo invertia a paridade de todo quinzenal.
  it('quinzenal impar recebe em 2026-07-13 e 2026-07-27 (fuso BR)', () => {
    comTZ('America/Sao_Paulo')
    expect(isUserDeliveryWeek(impar, '2026-07-13')).toBe(true)
    expect(isUserDeliveryWeek(impar, '2026-07-20')).toBe(false)
    expect(isUserDeliveryWeek(impar, '2026-07-27')).toBe(true)
  })

  // Regressão #48: a semana ISO 53 de 2026 é seguida da semana 1 de 2027, ambas ímpares.
  // Pela regra antiga o ciclo impar recebia duas semanas seguidas e o par ficava três sem.
  it('alterna de 2 em 2 semanas na virada 2026→2027', () => {
    expect(isUserDeliveryWeek(impar, '2026-12-28')).toBe(true)
    expect(isUserDeliveryWeek(impar, '2027-01-04')).toBe(false)
    expect(isUserDeliveryWeek(impar, '2027-01-11')).toBe(true)

    expect(isUserDeliveryWeek(par, '2026-12-21')).toBe(true)
    expect(isUserDeliveryWeek(par, '2026-12-28')).toBe(false)
    expect(isUserDeliveryWeek(par, '2027-01-04')).toBe(true)
  })

  it.each([['impar', impar], ['par', par]] as const)(
    'ciclo %s nunca tem duas entregas seguidas nem gap de 3 semanas (2025–2033)',
    (_nome, user) => {
      const entregas = segundasEntre('2025-12-29', '2033-12-26').filter((w) =>
        isUserDeliveryWeek(user, w),
      )
      expect(entregas.length).toBeGreaterThan(200)
      for (let i = 1; i < entregas.length; i++) {
        const gap = getWeekIndex(entregas[i]) - getWeekIndex(entregas[i - 1])
        expect(gap, `gap de ${gap} semanas em ${entregas[i - 1]} → ${entregas[i]}`).toBe(2)
      }
    },
  )
})

describe('getWeekStart', () => {
  it('devolve a segunda da semana', () => {
    expect(getWeekStart(new Date(2026, 6, 15))).toBe('2026-07-13')
    expect(getWeekStart(new Date(2026, 6, 13))).toBe('2026-07-13')
  })

  it('domingo pertence à semana que começou na segunda anterior', () => {
    expect(getWeekStart(new Date(2026, 6, 19))).toBe('2026-07-13')
  })

  it('atravessa virada de mês', () => {
    expect(getWeekStart(new Date(2026, 7, 1))).toBe('2026-07-27')
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
