import { describe, it, expect } from 'vitest'
import { parseDataBR } from './csv'
import { paridadeDaSemanaDe, getWeekStart, isFixoWeek, isUserDeliveryWeek } from './week'
import { fimDaAcolhidaDesde } from './acolhida'

// Dados que vêm do formulário de inscrição: data em pt-BR e a semana em que o membro começa.
// Roda sob BR/UTC/UTC+14 — é onde parse de data costuma escorregar um dia.

describe('parseDataBR', () => {
  it('converte o formato do Google Forms', () => {
    expect(parseDataBR('15/08/2026')).toBe('2026-08-15')
    expect(parseDataBR('1/9/2026')).toBe('2026-09-01')
    expect(parseDataBR(' 31/08/2026 ')).toBe('2026-08-31')
  })

  it('campo ruim vira null, nunca uma data inventada', () => {
    expect(parseDataBR('')).toBeNull()
    expect(parseDataBR('Sim')).toBeNull()
    expect(parseDataBR('31/02/2026')).toBeNull()   // Date normalizaria para 03/03
    expect(parseDataBR('15/13/2026')).toBeNull()
  })
})

describe('paridadeDaSemanaDe', () => {
  it('datas da mesma semana dão a mesma paridade', () => {
    // 17/08/2026 e 19/08/2026 caem na mesma semana (segunda e quarta).
    expect(paridadeDaSemanaDe('2026-08-17')).toBe(paridadeDaSemanaDe('2026-08-19'))
  })

  it('semanas seguidas alternam', () => {
    expect(paridadeDaSemanaDe('2026-08-17')).not.toBe(paridadeDaSemanaDe('2026-08-24'))
  })

  it('a paridade escolhida faz o membro receber na semana que ele informou', () => {
    for (const inicio of ['2026-08-15', '2026-08-17', '2026-08-19', '2026-08-31']) {
      const semana = getWeekStart(new Date(`${inicio}T12:00:00`))
      const u = { frequency: 'quinzenal' as const, quinzenalParity: paridadeDaSemanaDe(inicio) }
      expect(isUserDeliveryWeek(u, semana)).toBe(true)
    }
  })

  it('e NÃO receber na semana seguinte', () => {
    const u = { frequency: 'quinzenal' as const, quinzenalParity: paridadeDaSemanaDe('2026-08-17') }
    const semanaSeguinte = getWeekStart(new Date('2026-08-24T12:00:00'))
    expect(isUserDeliveryWeek(u, semanaSeguinte)).toBe(false)
  })

  it('as 4 inscrições reais se dividem entre os dois ciclos', () => {
    const paridades = ['2026-08-15', '2026-08-19', '2026-08-17', '2026-08-31'].map(paridadeDaSemanaDe)
    expect(new Set(paridades).size).toBe(2)   // não caem todos na mesma semana
  })
})

describe('fimDaAcolhidaDesde', () => {
  it('conta 30 dias da data de início, não da importação', () => {
    expect(fimDaAcolhidaDesde('2026-08-15')).toBe('2026-09-14')
    expect(fimDaAcolhidaDesde('2026-08-31')).toBe('2026-09-30')
  })

  it('atravessa virada de ano sem escorregar', () => {
    expect(fimDaAcolhidaDesde('2026-12-20')).toBe('2027-01-19')
  })
})
