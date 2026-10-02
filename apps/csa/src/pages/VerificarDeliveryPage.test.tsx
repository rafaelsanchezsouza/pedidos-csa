// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Payment, Tenant, User } from '@/types'

// A tela de conferência do delivery. O que importa aqui: só faturas 'Entrega' aparecem, o
// resumo soma o que deve, e a edição de linha fala com os endpoints de correção (não com o
// PUT, que não aceita mais `amount`).

// `colmeia` é a MESMA referência entre renders (no app real vem de useState): devolver um
// literal novo faria o efeito de carga rodar a cada render.
const { colmeia, corrigirSpy, desfazerSpy, updateSpy, gerarSpy, listSpy, usersSpy, uploadSpy } = vi.hoisted(() => ({
  colmeia: { id: 'c1', name: 'CSA', freteDelivery: 12 } as Tenant,
  corrigirSpy: vi.fn().mockResolvedValue({}),
  desfazerSpy: vi.fn().mockResolvedValue({}),
  updateSpy: vi.fn().mockResolvedValue({}),
  gerarSpy: vi.fn().mockResolvedValue({ generated: 2 }),
  listSpy: vi.fn(),
  usersSpy: vi.fn(),
  uploadSpy: vi.fn().mockResolvedValue('http://s/novo.jpg'),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ colmeia, user: { id: 'a1', acesso: ['admin'] } }),
}))
vi.mock('@/hooks/useUploadProof', () => ({ useUploadProof: () => ({ uploadProof: uploadSpy }) }))
vi.mock('@/services/api', () => ({
  paymentsApi: {
    list: listSpy, update: updateSpy, gerarFretes: gerarSpy,
    corrigirValor: corrigirSpy, desfazerCorrecao: desfazerSpy, anexarComprovante: vi.fn(),
  },
  usersApi: { list: usersSpy },
}))

import { VerificarDeliveryPage } from './VerificarDeliveryPage'

const fatura = (over: Partial<Payment> = {}): Payment => ({
  id: 'p1', userId: 'u1', userName: 'Ana', tenantId: 'c1', month: '2026-09',
  producerName: 'Entrega', amount: 36, verified: false, dateCreated: '', dateUpdated: '',
  ...over,
} as Payment)

const membros = [
  { id: 'u1', name: 'Ana' },
  { id: 'u2', name: 'Bruno', freteDelivery: 20 },
] as unknown as User[]

beforeEach(() => {
  vi.clearAllMocks()
  colmeia.freteDelivery = 12
  delete colmeia.fretePorBairro
  usersSpy.mockResolvedValue(membros)
})

describe('VerificarDeliveryPage', () => {
  it('lista só as faturas de entrega e ignora cota e produtor', async () => {
    listSpy.mockResolvedValue([
      fatura(),
      fatura({ id: 'p2', userName: 'Zeca', producerName: 'Cota', amount: 260 }),
      fatura({ id: 'p3', userName: 'Zeca', producerName: 'Sítio', amount: 50 }),
    ])
    render(<VerificarDeliveryPage />)
    expect(await screen.findAllByText('Ana')).not.toHaveLength(0)
    expect(screen.queryByText('Zeca')).not.toBeInTheDocument()
  })

  it('mostra o frete por entrega e quantas entregas entraram na conta', async () => {
    listSpy.mockResolvedValue([fatura(), fatura({ id: 'p2', userId: 'u2', userName: 'Bruno', amount: 60 })])
    render(<VerificarDeliveryPage />)
    const linhaAna = (await screen.findAllByRole('row')).find((r) => within(r).queryByText('Ana'))!
    expect(within(linhaAna).getByText('R$ 12.00')).toBeInTheDocument()
    expect(within(linhaAna).getByText('3')).toBeInTheDocument()
    // Bruno tem override de R$20: 60 / 20 = 3
    const linhaBruno = (await screen.findAllByRole('row')).find((r) => within(r).queryByText('Bruno'))!
    expect(within(linhaBruno).getByText('R$ 20.00')).toBeInTheDocument()
  })

  it('o resumo separa verificado, a conferir e sem comprovante', async () => {
    listSpy.mockResolvedValue([
      fatura({ id: 'p1', amount: 36, verified: true }),
      fatura({ id: 'p2', userName: 'Bruno', amount: 24, proofUrl: 'http://s/1.jpg' }),
      fatura({ id: 'p3', userName: 'Caio', amount: 12 }),
    ])
    render(<VerificarDeliveryPage />)
    // "Verificado" também é rótulo de badge na tabela — o resumo tem região própria.
    const resumo = within(await screen.findByLabelText('Resumo do mês'))
    const bloco = (rotulo: string) => resumo.getByText(rotulo).closest('div')!.textContent ?? ''
    expect(bloco('Faturado')).toContain('R$ 72.00')
    expect(bloco('Verificado')).toContain('R$ 36.00')
    expect(bloco('A conferir')).toContain('R$ 24.00')
    expect(bloco('Sem comprovante')).toContain('R$ 12.00')
  })

  it('corrigir o valor usa o endpoint de correção, não o PUT', async () => {
    listSpy.mockResolvedValue([fatura({ proofUrl: 'http://s/1.jpg' })])
    render(<VerificarDeliveryPage />)
    await userEvent.click((await screen.findAllByRole('button', { name: 'Editar' }))[0]!)

    const valor = screen.getByLabelText(/valor da fatura/i)
    await userEvent.clear(valor)
    await userEvent.type(valor, '24')
    await userEvent.type(screen.getByLabelText(/motivo/i), 'faltou uma entrega')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar valor' }))

    expect(corrigirSpy).toHaveBeenCalledWith('p1', 24, 'faltou uma entrega', 'c1')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('linha corrigida mostra o de-para e oferece desfazer', async () => {
    listSpy.mockResolvedValue([fatura({ amount: 24, amountOriginal: 36, corrigido: true })])
    render(<VerificarDeliveryPage />)
    // desktop e mobile renderizam juntos no jsdom (a media query não se aplica)
    expect((await screen.findAllByText(/Corrigido · R\$ 36\.00 → R\$ 24\.00/))[0]).toBeInTheDocument()

    await userEvent.click((await screen.findAllByRole('button', { name: 'Editar' }))[0]!)
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer correção' }))
    expect(desfazerSpy).toHaveBeenCalledWith('p1', 'c1')
  })

  it('trocar o comprovante sobe na pasta do MEMBRO, não na do admin', async () => {
    listSpy.mockResolvedValue([fatura({ proofUrl: 'http://s/velho.jpg' })])
    render(<VerificarDeliveryPage />)
    await userEvent.click((await screen.findAllByRole('button', { name: 'Editar' }))[0]!)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'comp.jpg', { type: 'image/jpeg' }))

    expect(uploadSpy).toHaveBeenCalledWith(expect.any(File), 'c1', 'u1', expect.any(String))
    expect(updateSpy).toHaveBeenCalledWith('p1', { proofUrl: 'http://s/novo.jpg' }, 'c1')
  })

  it('quem recebe em casa sem preço de frete aparece como pendência, com o bairro', async () => {
    // estado real da CSA: padrão 0 (não vale como preço) + tabela por bairro
    colmeia.freteDelivery = 0
    colmeia.fretePorBairro = [{ bairro: 'Manaíra', price: 7 }]
    usersSpy.mockResolvedValue([
      { id: 'u1', name: 'Ana', neighborhood: 'manaira', deliveryType: 'entrega' },
      { id: 'u3', name: 'Caio', deliveryType: 'entrega', neighborhood: 'Cabedelo' },
      { id: 'u4', name: 'Dora', deliveryType: 'entrega' },
      { id: 'u5', name: 'Edu', deliveryType: 'retirada' },
    ] as unknown as User[])
    listSpy.mockResolvedValue([fatura()])
    render(<VerificarDeliveryPage />)

    expect(await screen.findByText(/sem frete definido/i)).toBeInTheDocument()
    expect(screen.getByText('Caio — Cabedelo')).toBeInTheDocument()
    expect(screen.getByText('Dora — sem bairro cadastrado')).toBeInTheDocument()
    // Ana casa com a tabela mesmo escrevendo "manaira"; Edu retira. Nenhum dos dois é pendência
    expect(screen.queryByText(/^Ana —/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Edu/)).not.toBeInTheDocument()
  })

  it('gerar faturas do mês chama /frete/all', async () => {
    listSpy.mockResolvedValue([fatura()])
    render(<VerificarDeliveryPage />)
    await userEvent.click(await screen.findByRole('button', { name: /gerar faturas/i }))
    expect(gerarSpy).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/), 'c1')
    expect(await screen.findByText(/2 fatura\(s\) criada\(s\)/)).toBeInTheDocument()
  })
})
