import { describe, it, expect } from 'vitest'
import type { Payment } from '@/types'
import { statusLabel, statusVariant } from './statusPagamento'

const fatura = (p: Partial<Payment>) => p as Payment

describe('statusPagamento', () => {
  it('pendente quando não há comprovante', () => {
    const p = fatura({})
    expect(statusLabel(p)).toBe('Pendente')
    expect(statusVariant(p)).toBe('destructive')
  })

  it('aguardando verificação quando tem comprovante mas não foi verificada', () => {
    const p = fatura({ proofUrl: 'https://exemplo/comprovante.jpg' })
    expect(statusLabel(p)).toBe('Aguardando verificação')
    expect(statusVariant(p)).toBe('secondary')
  })

  it('verificado quando o admin verificou', () => {
    const p = fatura({ verified: true, proofUrl: 'https://exemplo/comprovante.jpg' })
    expect(statusLabel(p)).toBe('Verificado')
    expect(statusVariant(p)).toBe('default')
  })

  // Estado incoerente, mas possível: verified sem proofUrl. `verified` vence.
  it('verificado vence a ausência de comprovante', () => {
    const p = fatura({ verified: true })
    expect(statusLabel(p)).toBe('Verificado')
    expect(statusVariant(p)).toBe('default')
  })

  it('label e variante nunca discordam de estado', () => {
    const casos: Array<[Partial<Payment>, string, string]> = [
      [{}, 'Pendente', 'destructive'],
      [{ proofUrl: 'x' }, 'Aguardando verificação', 'secondary'],
      [{ verified: true }, 'Verificado', 'default'],
    ]
    for (const [p, label, variante] of casos) {
      expect(statusLabel(fatura(p))).toBe(label)
      expect(statusVariant(fatura(p))).toBe(variante)
    }
  })
})
