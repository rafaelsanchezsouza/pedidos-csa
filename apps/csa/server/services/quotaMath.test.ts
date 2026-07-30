import { describe, it, expect } from 'vitest'
import { quotaAmount } from './quotaMath'

describe('quotaAmount', () => {
  const rateInteira = 65
  const rateMeia = 40

  it('qty ausente = 1 cota (retrocompat com membros sem o campo)', () => {
    expect(quotaAmount(rateInteira, undefined, 4)).toBe(260) // 65 × 1 × 4
  })

  it('qty 1 explícito = mesma cobrança', () => {
    expect(quotaAmount(rateInteira, 1, 4)).toBe(260)
  })

  it('André: 2 cotas inteiras', () => {
    expect(quotaAmount(rateInteira, 2, 4)).toBe(520) // 65 × 2 × 4
  })

  it('Luciano: 3 meias cotas', () => {
    expect(quotaAmount(rateMeia, 3, 4)).toBe(480) // 40 × 3 × 4
  })

  it('respeita o nº de entregas (quinzenal = menos semanas)', () => {
    expect(quotaAmount(rateInteira, 2, 2)).toBe(260) // 65 × 2 × 2
  })
})
