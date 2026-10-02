// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Payment } from '@/types'

// O delivery saiu desta tela: tem conferência própria em /verificar-delivery. Deixar as duas
// listando a mesma fatura faria dois lugares para marcar o mesmo pagamento como verificado.

const { listSpy } = vi.hoisted(() => ({ listSpy: vi.fn() }))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ colmeia: { id: 'c1', name: 'CSA' }, user: { id: 'a1', acesso: ['admin'] } }),
}))
vi.mock('react-router-dom', () => ({ Navigate: () => null }))
vi.mock('@/services/api', () => ({ paymentsApi: { list: listSpy, update: vi.fn() } }))

import { VerificarPagamentosPage } from './VerificarPagamentosPage'

const fatura = (over: Partial<Payment>): Payment => ({
  id: 'p', userId: 'u1', userName: 'Ana', tenantId: 'c1', month: '2026-09',
  producerName: 'Cota', amount: 10, verified: false, dateCreated: '', dateUpdated: '',
  ...over,
} as Payment)

beforeEach(() => vi.clearAllMocks())

describe('VerificarPagamentosPage', () => {
  it('não lista mais a fatura de delivery', async () => {
    listSpy.mockResolvedValue([
      fatura({ id: 'p1', producerName: 'Cota', amount: 260 }),
      fatura({ id: 'p2', producerName: 'Sítio', amount: 50 }),
      fatura({ id: 'p3', producerName: 'Entrega', amount: 36 }),
    ])
    render(<VerificarPagamentosPage />)

    expect((await screen.findAllByText('Cota')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sítio').length).toBeGreaterThan(0)
    expect(screen.queryByText('Entrega')).not.toBeInTheDocument()
    expect(screen.queryByText('R$ 36.00')).not.toBeInTheDocument()
  })

  it('mês só com delivery fica vazio aqui, não meio-listado', async () => {
    listSpy.mockResolvedValue([fatura({ id: 'p3', producerName: 'Entrega', amount: 36 })])
    render(<VerificarPagamentosPage />)
    expect(await screen.findByText(/Nenhum pagamento registrado para este mês/)).toBeInTheDocument()
  })
})
