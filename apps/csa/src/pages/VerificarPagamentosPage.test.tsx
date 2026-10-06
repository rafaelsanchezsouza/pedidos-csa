// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Payment } from '@/types'

// O delivery saiu desta tela: tem conferência própria em /verificar-delivery. Deixar as duas
// listando a mesma fatura faria dois lugares para marcar o mesmo pagamento como verificado.

const { listSpy, corrigirSpy, updateSpy, auth } = vi.hoisted(() => ({
  listSpy: vi.fn(), corrigirSpy: vi.fn().mockResolvedValue({}), updateSpy: vi.fn().mockResolvedValue({}),
  auth: { user: { id: 'a1', acesso: ['admin'] } as { id: string; acesso: string[]; name?: string } },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ colmeia: { id: 'c1', name: 'CSA' }, user: auth.user }),
}))
vi.mock('react-router-dom', () => ({ Navigate: () => null }))
vi.mock('@/hooks/useUploadProof', () => ({ useUploadProof: () => ({ uploadProof: vi.fn() }) }))
vi.mock('@/services/api', () => ({
  paymentsApi: { list: listSpy, update: updateSpy, corrigirValor: corrigirSpy, desfazerCorrecao: vi.fn(), anexarComprovante: vi.fn() },
}))

import { VerificarPagamentosPage } from './VerificarPagamentosPage'

const fatura = (over: Partial<Payment>): Payment => ({
  id: 'p', userId: 'u1', userName: 'Ana', tenantId: 'c1', month: '2026-09',
  producerName: 'Cota', amount: 10, verified: false, dateCreated: '', dateUpdated: '',
  ...over,
} as Payment)

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 'a1', acesso: ['admin'] }
})

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

  // A correção não é privilégio do delivery: o motor nunca distinguiu por producerName.
  it('fatura de produtor também é corrigível pelo admin', async () => {
    listSpy.mockResolvedValue([fatura({ id: 'p2', producerName: 'Sítio', amount: 50 })])
    render(<VerificarPagamentosPage />)
    await userEvent.click((await screen.findAllByRole('button', { name: 'Editar' }))[0]!)

    const valor = screen.getByLabelText(/valor da fatura/i)
    await userEvent.clear(valor)
    await userEvent.type(valor, '42')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar valor' }))

    expect(corrigirSpy).toHaveBeenCalledWith('p2', 42, '', 'c1')
  })

  it('mês só com delivery fica vazio aqui, não meio-listado', async () => {
    listSpy.mockResolvedValue([fatura({ id: 'p3', producerName: 'Entrega', amount: 36 })])
    render(<VerificarPagamentosPage />)
    expect(await screen.findByText(/Nenhum pagamento registrado para este mês/)).toBeInTheDocument()
  })

  // Pagamento por fora (dinheiro, Pix sem print): o admin dá baixa pelo badge, com confirmação.
  it('admin marca Pendente como verificado depois de confirmar', async () => {
    listSpy.mockResolvedValue([fatura({ id: 'p1', producerName: 'Cota', amount: 65 })])
    render(<VerificarPagamentosPage />)
    await userEvent.click((await screen.findAllByRole('button', { name: 'Pendente' }))[0]!)
    expect(updateSpy).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Marcar como verificado' }))
    expect(updateSpy).toHaveBeenCalledWith('p1', { verified: true }, 'c1')
  })

  it('fornecedor vê o status, mas sem o atalho', async () => {
    auth.user = { id: 'f1', acesso: ['fornecedor'], name: 'Sítio' }
    listSpy.mockResolvedValue([fatura({ id: 'p2', producerName: 'Sítio', amount: 50 })])
    render(<VerificarPagamentosPage />)
    expect((await screen.findAllByText('Pendente')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Pendente' })).not.toBeInTheDocument()
  })
})
