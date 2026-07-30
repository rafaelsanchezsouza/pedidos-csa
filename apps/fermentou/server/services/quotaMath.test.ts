import { describe, it, expect } from 'vitest'
import { tiersDoTenant, weeklyRate } from './quotaMath.js'

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
