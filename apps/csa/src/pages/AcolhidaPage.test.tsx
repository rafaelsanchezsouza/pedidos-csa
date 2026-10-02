// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Payment, User } from '@/types'

// Amarração tela → API da acolhida. A regra do prazo é testada pura em
// packages/core/src/domain/acolhida.test.ts (×3 fusos); aqui o que importa é a tela
// respeitar o `aberto` que o servidor devolve e mandar a confirmação certa.

const { membro, confirmarSpy, anexarSpy, uploadSpy, updateMeSpy, semana, cota, frete, faturas } = vi.hoisted(() => ({
  membro: {
    id: 'u1', name: 'Novo', email: 'novo@ex.com', address: 'Rua 1', contact: '11999999999',
    frequency: 'semanal', deliveryType: 'retirada', tenantId: 'c1', acesso: 'user',
    quota: 'Cota inteira', acolhidaExpiry: '2099-12-31',
  } as User,
  confirmarSpy: vi.fn().mockResolvedValue({ ok: true }),
  anexarSpy: vi.fn().mockResolvedValue({ id: 'p1', proofs: [] }),
  uploadSpy: vi.fn().mockResolvedValue('http://s/pix.jpg'),
  updateMeSpy: vi.fn().mockResolvedValue({}),
  semana: { confirmacao: null, prazo: '2099-09-01T02:59:59.999Z', aberto: true },
  cota: { id: 'p1', producerName: 'Cota', amount: 65, proofs: [] } as unknown as Payment,
  frete: { id: 'p2', producerName: 'Entrega', amount: 12, proofs: [] } as unknown as Payment,
  faturas: [] as Payment[],
}))

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('@/hooks/useUploadProof', () => ({ useUploadProof: () => ({ uploadProof: uploadSpy }) }))
vi.mock('@/services/api', () => ({
  acolhidaApi: { getSemana: vi.fn(() => Promise.resolve(semana)), confirmar: confirmarSpy },
  paymentsApi: { getMy: vi.fn(() => Promise.resolve(faturas)), anexarComprovante: anexarSpy },
  usersApi: { updateMe: updateMeSpy },
}))

import { AcolhidaPage } from './AcolhidaPage'

beforeEach(() => {
  vi.clearAllMocks()
  semana.confirmacao = null
  semana.aberto = true
  cota.proofs = []
  frete.proofs = []
  faturas.length = 0
  faturas.push(cota)
  membro.deliveryType = 'retirada'
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

// A fatura de frete da acolhida é gerada na confirmação da semana (routes/acolhida.ts) e
// até aqui não tinha onde receber comprovante: a tela só oferecia o anexo da cota.
describe('comprovante do delivery na acolhida', () => {
  it('quem retira na colmeia não vê o bloco do delivery', async () => {
    render(<AcolhidaPage />)
    expect(await screen.findByLabelText('Cota')).toBeInTheDocument()
    expect(screen.queryByLabelText('Delivery')).not.toBeInTheDocument()
    expect(screen.getByText('Comprovante desta semana')).toBeInTheDocument()
  })

  it('quem recebe em casa anexa os dois, cada um na sua fatura', async () => {
    membro.deliveryType = 'entrega'
    faturas.push(frete)
    render(<AcolhidaPage />)

    const bloco = within(await screen.findByLabelText('Delivery'))
    expect(bloco.getByText(/R\$ 12\.00/)).toBeInTheDocument()
    expect(screen.getByText('Comprovantes desta semana')).toBeInTheDocument()

    const inputDoDelivery = (await screen.findByLabelText('Delivery'))
      .querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(inputDoDelivery, new File(['x'], 'pix.jpg', { type: 'image/jpeg' }))
    // vai para a fatura 'Entrega' (p2), não para a da cota
    expect(anexarSpy).toHaveBeenCalledWith('p2', expect.any(String), 'http://s/pix.jpg', 'c1')
    // o arquivo sobe na pasta do próprio membro
    expect(uploadSpy).toHaveBeenCalledWith(expect.any(File), 'c1', 'u1', expect.any(String))
  })

  it('sem fatura de frete (frete zero) o bloco não aparece, mesmo recebendo em casa', async () => {
    membro.deliveryType = 'entrega'
    render(<AcolhidaPage />)
    expect(await screen.findByLabelText('Cota')).toBeInTheDocument()
    expect(screen.queryByLabelText('Delivery')).not.toBeInTheDocument()
  })
})
