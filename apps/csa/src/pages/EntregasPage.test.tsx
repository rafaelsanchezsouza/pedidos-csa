// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Order, User } from '@/types'

// Tirar alguém da entrega da semana sempre existiu (suspender). Aqui está o caminho inverso:
// incluir à mão quem os filtros semanais deixam de fora — inclusive quem retira na colmeia.

// `colmeia` precisa ser a MESMA referência entre renders: no app real ela vem de useState,
// e o `load` da página depende dela. Devolver um literal novo a cada chamada faria o efeito
// recarregar a cada render e desfazer o que o teste acabou de fazer.
const { colmeia, ordersSpy, usersSpy, createSpy, updateSpy, acolhidaSpy, reorderSpy } = vi.hoisted(() => ({
  colmeia: { id: 'c1', name: 'CSA' },
  ordersSpy: vi.fn(),
  usersSpy: vi.fn(),
  createSpy: vi.fn(),
  updateSpy: vi.fn().mockResolvedValue({}),
  acolhidaSpy: vi.fn().mockResolvedValue([]),
  reorderSpy: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ colmeia, user: { id: 'a1', acesso: ['admin'] } }),
}))
vi.mock('@/services/api', () => ({
  ordersApi: { getConsolidated: ordersSpy, create: createSpy, update: updateSpy },
  usersApi: { list: usersSpy, reorderDelivery: reorderSpy },
  acolhidaApi: { listSemana: acolhidaSpy },
}))

import { EntregasPage } from './EntregasPage'

const BASE = {
  id: 'x', name: 'X', email: '', address: 'Rua 1', contact: '', frequency: 'semanal',
  deliveryType: 'entrega', tenantId: 'c1', acesso: 'user',
} as unknown as User

const membro = (over: Partial<User>): User => ({ ...BASE, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  createSpy.mockImplementation(async (d: Partial<Order>) => ({ id: 'novo', ...d }))
  ordersSpy.mockResolvedValue([])
  usersSpy.mockResolvedValue([
    membro({ id: 'u1', name: 'Ana' }),
    membro({ id: 'u2', name: 'Bruno', deliveryType: 'retirada' }),
  ])
})

const linhaDe = async (nome: string) => {
  const linhas = await screen.findAllByRole('row')
  return linhas.find((r) => within(r).queryByText(nome))
}

describe('adicionar membro à entrega da semana', () => {
  it('quem retira na colmeia fica fora da lista, mas aparece como candidato com o motivo', async () => {
    render(<EntregasPage />)
    expect(await linhaDe('Ana')).toBeTruthy()
    expect(await linhaDe('Bruno')).toBeFalsy()

    const candidatos = screen.getByRole('list')
    expect(within(candidatos).getByText('Bruno')).toBeInTheDocument()
    expect(within(candidatos).getByText(/retira na colmeia/i)).toBeInTheDocument()
  })

  it('adicionar cria o pedido mínimo da semana com incluida', async () => {
    render(<EntregasPage />)
    const candidatos = await screen.findByRole('list')
    await userEvent.click(within(candidatos).getByRole('button', { name: 'Adicionar' }))

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', items: [], status: 'rascunho', incluida: true }),
      'c1',
    )
    // a linha nova aparece marcada como exceção da semana
    expect(await screen.findByText('Adicionada')).toBeInTheDocument()
    expect(await linhaDe('Bruno')).toBeTruthy()
  })

  it('a busca filtra sem depender de acento nem de caixa', async () => {
    usersSpy.mockResolvedValue([
      membro({ id: 'u1', name: 'Ana' }),
      membro({ id: 'u2', name: 'Antônio', deliveryType: 'retirada' }),
      membro({ id: 'u3', name: 'Bruno', deliveryType: 'retirada' }),
    ])
    render(<EntregasPage />)
    await userEvent.type(await screen.findByLabelText(/buscar membro/i), 'antonio')

    const candidatos = screen.getByRole('list')
    expect(within(candidatos).getByText('Antônio')).toBeInTheDocument()
    expect(within(candidatos).queryByText('Bruno')).not.toBeInTheDocument()
  })

  it('membro já incluído aparece na lista com badge e sai pelo mesmo botão', async () => {
    ordersSpy.mockResolvedValue([
      { id: 'o2', userId: 'u2', userName: 'Bruno', tenantId: 'c1', weekId: '2026-09-07',
        items: [], status: 'rascunho', incluida: true } as unknown as Order,
    ])
    render(<EntregasPage />)
    const linha = await linhaDe('Bruno')
    expect(linha).toBeTruthy()
    expect(within(linha!).getByText('Adicionada')).toBeInTheDocument()

    await userEvent.click(within(linha!).getByTitle(/tirar da entrega/i))
    expect(updateSpy).toHaveBeenCalledWith('o2', { incluida: false }, 'c1')
  })

  it('o quinzenal fora da vez entra pelo mesmo caminho, com o motivo certo', async () => {
    usersSpy.mockResolvedValue([
      membro({ id: 'u1', name: 'Ana' }),
      membro({ id: 'u9', name: 'Quinzenal', frequency: 'quinzenal', quinzenalParity: 'par' }),
      membro({ id: 'u8', name: 'Outro', frequency: 'quinzenal', quinzenalParity: 'impar' }),
    ])
    render(<EntregasPage />)
    const candidatos = await screen.findByRole('list')
    // um dos dois quinzenais está fora nesta semana, e o motivo tem que dizer isso
    expect(within(candidatos).getByText(/quinzenal — outra semana/i)).toBeInTheDocument()
  })
})
