// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Tenant, User } from '@/types'

// Bairro define o preço do frete, então deixou de ser texto livre. No formulário é dropdown;
// no CSV — onde o texto chega sujo do Google Forms — é match contra a tabela, e o que não
// casa cria o membro assim mesmo, marcado para correção.

const { batchSpy, admin, colmeia } = vi.hoisted(() => ({
  batchSpy: vi.fn().mockResolvedValue({ results: [{ name: 'Ana', email: 'a@ex.com', success: true }] }),
  admin: { id: 'a1', name: 'Admin', tenantId: 'c1', acesso: ['admin'] } as unknown as User,
  colmeia: {
    id: 'c1', name: 'CSA',
    fretePorBairro: [{ bairro: 'Manaíra', price: 7 }, { bairro: 'Bessa', price: 9 }],
  } as unknown as Tenant,
}))

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/services/api', () => ({
  usersApi: { list: vi.fn().mockResolvedValue([]), update: vi.fn(), createMemberBatch: batchSpy },
  producersApi: { list: vi.fn().mockResolvedValue([]) },
  rolesApi: { list: vi.fn().mockResolvedValue([]) },
  tenantsApi: { create: vi.fn(), update: vi.fn() },
}))

import { AdminPage } from './AdminPage'

const CSV = [
  'Timestamp,Nome,e-mail,Whatsapp,Logradouro,Complemento,Bairro,CEP,Retirada,Frequência,1a entrega,y,Tamanho Cota',
  // grafia divergente: casa com "Manaíra" da tabela
  '2026-10-01 09:00,Ana,a@ex.com,83999999991,Rua 1,,manaira,58000-000,Entrega,Semanal,,,Cota inteira',
  // bairro fora da tabela: cria mesmo assim, marcado
  '2026-10-01 09:00,Bia,b@ex.com,83999999992,Rua 2,,Cabedelo,58000-000,Entrega,Semanal,,,Cota inteira',
].join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({
    colmeia, colmeias: [colmeia], user: admin, refreshUser: vi.fn(), selectColmeia: vi.fn(),
  })
})

describe('bairro no cadastro', () => {
  it('é dropdown com os bairros da tabela, não campo livre', async () => {
    render(<AdminPage />)
    await userEvent.click(await screen.findByRole('button', { name: /novo membro/i }))

    const select = await screen.findByLabelText('Bairro')
    expect(select.tagName).toBe('SELECT')
    expect(within(select).getByRole('option', { name: 'Manaíra' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Bessa' })).toBeInTheDocument()
  })
})

describe('import por CSV', () => {
  it('casa a grafia divergente e grava a da tabela; o que não casa entra como veio', async () => {
    render(<AdminPage />)
    await userEvent.click(await screen.findByRole('button', { name: /importar csv/i }))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File([CSV], 'membros.csv', { type: 'text/csv' }))

    // a conferência mostra o resultado do match ANTES de criar
    expect(await screen.findByText('Cabedelo — corrigir')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: /criar 2 membro/i }))
    await waitFor(() => expect(batchSpy).toHaveBeenCalled())

    const enviados = batchSpy.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(enviados.find((m) => m.name === 'Ana')!.neighborhood).toBe('Manaíra') // normalizado
    expect(enviados.find((m) => m.name === 'Bia')!.neighborhood).toBe('Cabedelo') // preservado
  })
})
