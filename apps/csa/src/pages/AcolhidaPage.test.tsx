// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Payment, User } from '@/types'

// Amarração tela → API da acolhida. A regra do prazo é testada pura em
// packages/core/src/domain/acolhida.test.ts (×3 fusos); aqui o que importa é a tela
// respeitar o `aberto` que o servidor devolve e mandar a confirmação certa.

const { membro, confirmarSpy, anexarSpy, updateMeSpy, semana, cota } = vi.hoisted(() => ({
  membro: {
    id: 'u1', name: 'Novo', email: 'novo@ex.com', address: 'Rua 1', contact: '11999999999',
    frequency: 'semanal', deliveryType: 'retirada', tenantId: 'c1', acesso: 'user',
    quota: 'Cota inteira', acolhidaExpiry: '2099-12-31',
  } as User,
  confirmarSpy: vi.fn().mockResolvedValue({ ok: true }),
  anexarSpy: vi.fn().mockResolvedValue({ id: 'p1', proofs: [] }),
  updateMeSpy: vi.fn().mockResolvedValue({}),
  semana: { confirmacao: null, prazo: '2099-09-01T02:59:59.999Z', aberto: true },
  cota: { id: 'p1', producerName: 'Cota', amount: 65, proofs: [] } as unknown as Payment,
}))

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('@/hooks/useUploadProof', () => ({ useUploadProof: () => ({ uploadProof: vi.fn() }) }))
vi.mock('@/services/api', () => ({
  acolhidaApi: { getSemana: vi.fn(() => Promise.resolve(semana)), confirmar: confirmarSpy },
  paymentsApi: { getMy: vi.fn(() => Promise.resolve([cota])), anexarComprovante: anexarSpy },
  usersApi: { updateMe: updateMeSpy },
}))

import { AcolhidaPage } from './AcolhidaPage'

beforeEach(() => {
  vi.clearAllMocks()
  semana.confirmacao = null
  semana.aberto = true
  mockUseAuth.mockReturnValue({
    colmeia: { id: 'c1', name: 'CSA', weekChangeDay: 0 },
    user: membro,
    refreshUser: vi.fn(),
  })
})

describe('AcolhidaPage', () => {
  it('"Quero receber" manda confirmado=true para a semana atual', async () => {
    render(<AcolhidaPage />)
    await userEvent.click(await screen.findByRole('button', { name: /quero receber/i }))
    expect(confirmarSpy).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), true, 'c1')
  })

  it('"Esta semana não" manda confirmado=false — dizer não é resposta, não silêncio', async () => {
    render(<AcolhidaPage />)
    await userEvent.click(await screen.findByRole('button', { name: /esta semana não/i }))
    expect(confirmarSpy).toHaveBeenCalledWith(expect.any(String), false, 'c1')
  })

  it('prazo encerrado desabilita os dois botões e explica', async () => {
    semana.aberto = false
    render(<AcolhidaPage />)
    expect(await screen.findByRole('button', { name: /quero receber/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /esta semana não/i })).toBeDisabled()
    expect(screen.getByText(/prazo desta semana encerrou/i)).toBeInTheDocument()
  })

  it('o tique de entrega altera o cadastro do membro, não a semana', async () => {
    render(<AcolhidaPage />)
    await userEvent.click(await screen.findByRole('button', { name: /entrega em casa/i }))
    expect(updateMeSpy).toHaveBeenCalledWith({ deliveryType: 'entrega' }, 'c1')
    expect(confirmarSpy).not.toHaveBeenCalled()
  })

  it('mostra o total do mês da fatura de cota', async () => {
    render(<AcolhidaPage />)
    expect(await screen.findByText(/R\$ 65,00|R\$ 65\.00/)).toBeInTheDocument()
  })
})
