import { describe, it, expect } from 'vitest'
import { tiersDoTenant, weeklyRate, quotaAmount } from './quota'

describe('tiersDoTenant', () => {
  it('usa quotas dinâmicas quando presentes', () => {
    const t = { quotas: [{ name: 'Fornada Completa', price: 80 }, { name: 'Fornada Leve', price: 50 }] }
    expect(tiersDoTenant(t)).toEqual(t.quotas)
  })

  it('deriva do legado inteira/meia quando quotas ausente', () => {
    expect(tiersDoTenant({ quotaInteira: 70, quotaMeia: 45 })).toEqual([
      { name: 'Cota inteira', price: 70 },
      { name: 'Meia cota', price: 45 },
    ])
  })

  it('usa defaults 65/40 quando nada definido', () => {
    expect(tiersDoTenant(null)).toEqual([
      { name: 'Cota inteira', price: 65 },
      { name: 'Meia cota', price: 40 },
    ])
  })
})

describe('weeklyRate', () => {
  const tenant = { quotas: [{ name: 'Fornada Completa', price: 80 }, { name: 'Fornada Leve', price: 50 }] }

  it('resolve o preço do tier pelo nome', () => {
    expect(weeklyRate('Fornada Completa', tenant)).toBe(80)
    expect(weeklyRate('Fornada Leve', tenant)).toBe(50)
  })

  it('funciona com dados legados (nome + inteira/meia)', () => {
    const legado = { quotaInteira: 65, quotaMeia: 40 }
    expect(weeklyRate('Cota inteira', legado)).toBe(65)
    expect(weeklyRate('Meia cota', legado)).toBe(40)
  })

  it('cota inexistente cai no fallback (inteira legada, senão 65)', () => {
    expect(weeklyRate('Inexistente', { quotaInteira: 65, quotaMeia: 40 })).toBe(65)
    expect(weeklyRate(undefined, tenant)).toBe(65)
  })
})

describe('quotaAmount', () => {
  const rateInteira = 65
  const rateMeia = 40

  it('qty ausente = 1 cota (retrocompat com membros sem o campo)', () => {
    expect(quotaAmount(rateInteira, undefined, 4)).toBe(260) // 65 × 1 × 4
  })

  it('qty 1 explícito = mesma cobrança', () => {
    expect(quotaAmount(rateInteira, 1, 4)).toBe(260)
  })

  it('2 cotas inteiras', () => {
    expect(quotaAmount(rateInteira, 2, 4)).toBe(520) // 65 × 2 × 4
  })

  it('3 meias cotas', () => {
    expect(quotaAmount(rateMeia, 3, 4)).toBe(480) // 40 × 3 × 4
  })

  it('respeita o nº de entregas (quinzenal = menos semanas)', () => {
    expect(quotaAmount(rateInteira, 2, 2)).toBe(260) // 65 × 2 × 2
  })

  // A composição que o paymentService unificado usa: preço do tier × qty × semanas.
  it('compõe com weeklyRate (tier dinâmico × qty × semanas)', () => {
    const tenant = { quotas: [{ name: 'Fornada Completa', price: 80 }, { name: 'Fornada Leve', price: 50 }] }
    expect(quotaAmount(weeklyRate('Fornada Completa', tenant), 2, 4)).toBe(640) // 80 × 2 × 4
  })
})
