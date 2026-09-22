// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Amarração tela → catálogo na montagem da oferta. A regra do match é testada pura em
// packages/core/src/domain/matchProduto.test.ts; aqui o que importa é a tela reconferir o
// vínculo quando o nome é corrigido e deixar entrar produto que não veio na mensagem.

const { parseSpy, createSpy, produtos } = vi.hoisted(() => ({
  parseSpy: vi.fn(),
  createSpy: vi.fn().mockResolvedValue({ id: 'o1' }),
  produtos: [
    { id: 'prod-macaxeira', name: 'Macaxeira', unit: 'kg', price: 6, producerId: 'f1', tenantId: 'c1', dateUpdated: '' },
    { id: 'prod-outro', name: 'Alface', unit: 'unid', price: 3, producerId: 'f2', tenantId: 'c1', dateUpdated: '' },
  ],
}))

vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams(), vi.fn()] }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ colmeia: { id: 'c1', name: 'CSA' } }) }))
vi.mock('@/services/api', () => ({
  offeringsApi: { list: vi.fn(() => Promise.resolve([])), parse: parseSpy, create: createSpy, update: vi.fn(), fallback: vi.fn() },
  producersApi: { list: vi.fn(() => Promise.resolve([{ id: 'f1', name: 'Sítio', contact: '', tenantId: 'c1' }])) },
  productsApi: { list: vi.fn(() => Promise.resolve(produtos)) },
  tenantsApi: { get: vi.fn(() => Promise.resolve({ id: 'c1', extrasAberto: true })), update: vi.fn() },
}))

import { OfertasPage } from './OfertasPage'

async function abrirComOfertaGerada() {
  render(<OfertasPage />)
  await userEvent.click(await screen.findByRole('button', { name: /nova oferta/i }))
  await userEvent.type(screen.getByPlaceholderText(/cole aqui/i), 'Macaxeira Natural kg R$4,00')
  await userEvent.click(screen.getByRole('button', { name: /gerar oferta/i }))
  return await screen.findByDisplayValue('Macaxeira Natural kg')
}

beforeEach(() => {
  vi.clearAllMocks()
  // O parser devolve o nome cru, sem casar com o catálogo — é o caso do dia a dia.
  parseSpy.mockResolvedValue([{ name: 'Macaxeira Natural kg', unit: 'kg', price: 4, type: 'extra' }])
})

describe('OfertasPage — montagem da oferta', () => {
  it('corrigir o nome reconfere o catálogo no blur e mostra o vínculo encontrado', async () => {
    const nome = await abrirComOfertaGerada()
    const cartao = nome.closest('div.border') as HTMLElement
    expect(within(cartao).getByText(/produto novo/i)).toBeInTheDocument()

    await userEvent.clear(nome)
    await userEvent.type(nome, 'Macaxeira')
    // Enquanto o campo está em foco nada muda — reconferir a cada tecla travava a digitação.
    expect(within(cartao).getByText(/produto novo/i)).toBeInTheDocument()

    await userEvent.tab()
    expect(within(cartao).getByText(/macaxeira/i, { selector: 'span' })).toBeInTheDocument()
    expect(within(cartao).queryByText(/produto novo/i)).not.toBeInTheDocument()
  })

  it('ao identificar o produto, traz o preço do catálogo', async () => {
    const nome = await abrirComOfertaGerada()
    const cartao = nome.closest('div.border') as HTMLElement
    expect(within(cartao).getByDisplayValue('4')).toBeInTheDocument() // preço da mensagem

    await userEvent.clear(nome)
    await userEvent.type(nome, 'Macaxeira')
    await userEvent.tab()

    expect(within(cartao).getByDisplayValue('6')).toBeInTheDocument() // preço do catálogo
  })

  it('nome que deixa de casar desfaz o vínculo', async () => {
    const nome = await abrirComOfertaGerada()
    const cartao = nome.closest('div.border') as HTMLElement
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Macaxeira')
    await userEvent.tab()
    expect(within(cartao).queryByText(/produto novo/i)).not.toBeInTheDocument()

    await userEvent.clear(nome)
    await userEvent.type(nome, 'Quiabo')
    await userEvent.tab()
    expect(within(cartao).getByText(/produto novo/i)).toBeInTheDocument()
  })

  it('só oferece o catálogo do produtor selecionado', async () => {
    await abrirComOfertaGerada()
    expect(screen.queryByText('Alface')).not.toBeInTheDocument()
  })

  it('adiciona produto fora da mensagem sem perder as edições já feitas', async () => {
    const nome = await abrirComOfertaGerada()
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Macaxeira')
    await userEvent.tab()

    await userEvent.click(screen.getByRole('button', { name: /adicionar produto/i }))
    const novos = screen.getAllByPlaceholderText('Nome do produto')
    await userEvent.type(novos[novos.length - 1]!, 'Quiabo')

    expect(screen.getByDisplayValue('Macaxeira')).toBeInTheDocument()
    expect(parseSpy).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: /salvar oferta/i }))
    const enviado = createSpy.mock.calls[0]![0]
    expect(enviado.items).toHaveLength(2)
    expect(enviado.items[0]).toMatchObject({ productId: 'prod-macaxeira', productName: 'Macaxeira', price: 6 })
    expect(enviado.items[1]!.productName).toBe('Quiabo')
    expect(enviado.items[1]!.productId).not.toBe('prod-macaxeira')
  })

  it('não deixa salvar com produto sem nome', async () => {
    await abrirComOfertaGerada()
    await userEvent.click(screen.getByRole('button', { name: /adicionar produto/i }))
    expect(screen.getByRole('button', { name: /salvar oferta/i })).toBeDisabled()
  })
})
