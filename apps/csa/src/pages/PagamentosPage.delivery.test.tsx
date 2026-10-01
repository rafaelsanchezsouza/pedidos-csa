// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Tenant, Payment, User } from '@/types'

// O card do delivery: rótulo vem do vocabulário do app e o valor aparece destrinchado.
// A COMPOSIÇÃO é derivada da fatura (amount / frete), não recalculada — este teste trava
// isso, porque refazer `countDeliveryWeeks` no front divergiria do valor cobrado.

const { membro, colmeia, frete } = vi.hoisted(() => ({
  membro: {
    id: 'u1', name: 'Ana', email: 'a@ex.com', address: 'Rua 1', contact: '11999999999',
    frequency: 'semanal', deliveryType: 'entrega', tenantId: 'c1', acesso: 'user',
  } as unknown as User,
  colmeia: { id: 'c1', name: 'CSA', freteDelivery: 12 } as unknown as Tenant,
  frete: { id: 'pf', producerName: 'Entrega', amount: 36, verified: false } as unknown as Payment,
}))

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('@/hooks/useUploadProof', () => ({ useUploadProof: () => ({ uploadProof: vi.fn() }) }))
vi.mock('@/services/api', () => ({
  paymentsApi: {
    getMy: vi.fn(() => Promise.resolve([])),
    ensureQuota: vi.fn(() => Promise.resolve({ skipped: true })),
    ensureFrete: vi.fn(() => Promise.resolve(frete)),
    update: vi.fn(),
  },
  ordersApi: { getMonthly: vi.fn(() => Promise.resolve([])) },
}))

import { PagamentosPage } from './PagamentosPage'

beforeEach(() => {
  vi.clearAllMocks()
  delete (frete as Partial<Payment>).corrigido
  frete.amount = 36
  mockUseAuth.mockReturnValue({ user: membro, colmeia })
})

describe('card do Delivery em Meus Pagamentos', () => {
  it('usa o rótulo do app e mostra quanto custa cada entrega e quantas entraram', async () => {
    render(<PagamentosPage />)
    expect(await screen.findByText('Delivery')).toBeInTheDocument()
    expect(screen.getByText('R$ 36.00')).toBeInTheDocument()
    expect(screen.getByText('R$ 12.00 por entrega · 3 entregas')).toBeInTheDocument()
    // o card do delivery não cancela a mensagem de vazio por engano
    expect(screen.queryByText(/Nenhum pagamento para este mês/)).not.toBeInTheDocument()
  })

  it('uma entrega só não vira "1 entregas"', async () => {
    frete.amount = 12
    render(<PagamentosPage />)
    expect(await screen.findByText('R$ 12.00 por entrega · 1 entrega')).toBeInTheDocument()
  })

  it('fatura corrigida não mostra uma conta que não fecha', async () => {
    frete.amount = 30 // 30 não é múltiplo de 12: dizer "× 2,5 entregas" seria mentira
    frete.corrigido = true
    render(<PagamentosPage />)
    expect(await screen.findByText('Valor ajustado pela organização.')).toBeInTheDocument()
    expect(screen.queryByText(/por entrega ·/)).not.toBeInTheDocument()
  })

  it('o override do membro vence o padrão da colmeia', async () => {
    mockUseAuth.mockReturnValue({ user: { ...membro, freteDelivery: 9 }, colmeia })
    frete.amount = 18
    render(<PagamentosPage />)
    expect(await screen.findByText('R$ 9.00 por entrega · 2 entregas')).toBeInTheDocument()
  })
})
