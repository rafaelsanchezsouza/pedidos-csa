import { describe, it, expect } from 'vitest'
import { formatQuota } from './quota'

describe('formatQuota', () => {
  it('sem cota → string vazia', () => {
    expect(formatQuota({})).toBe('')
    expect(formatQuota({ quotaQty: 3 })).toBe('') // sem quota, qty é irrelevante
  })

  it('qty ausente = 1 (membro antigo, sem o campo)', () => {
    expect(formatQuota({ quota: 'Cota inteira' })).toBe('Cota inteira')
    expect(formatQuota({ quota: 'Meia cota' })).toBe('Meia cota')
  })

  it('qty 1 não mostra multiplicador', () => {
    expect(formatQuota({ quota: 'Cota inteira', quotaQty: 1 })).toBe('Cota inteira')
  })

  it('qty > 1 mostra ×N', () => {
    expect(formatQuota({ quota: 'Cota inteira', quotaQty: 2 })).toBe('Cota inteira ×2') // André
    expect(formatQuota({ quota: 'Meia cota', quotaQty: 3 })).toBe('Meia cota ×3') // Luciano
  })
})
