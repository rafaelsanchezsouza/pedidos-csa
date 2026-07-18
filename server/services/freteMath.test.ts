import { describe, it, expect } from 'vitest'
import { resolveFrete } from './freteMath'

describe('resolveFrete', () => {
  it('usa o padrão da colmeia quando o membro não tem override', () => {
    expect(resolveFrete({}, { freteDelivery: 12 })).toBe(12)
  })

  it('override do membro vence o padrão da colmeia', () => {
    expect(resolveFrete({ freteDelivery: 20 }, { freteDelivery: 12 })).toBe(20)
  })

  // O ponto do `??` vs `||`: 0 é frete válido (entrega grátis) e deve vencer o padrão.
  it('override 0 (entrega grátis) vence o padrão da colmeia', () => {
    expect(resolveFrete({ freteDelivery: 0 }, { freteDelivery: 12 })).toBe(0)
  })

  it('sem override e sem padrão → 0', () => {
    expect(resolveFrete({}, { })).toBe(0)
    expect(resolveFrete({}, null)).toBe(0)
  })

  it('padrão 0 na colmeia é respeitado', () => {
    expect(resolveFrete({}, { freteDelivery: 0 })).toBe(0)
  })
})
