// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@/types'

// AdminPage é uma tela grande com IO no mount. O alvo aqui é só um contrato: qual botão
// o PageHeader mostra em cada aba. Por isso auth, api e router são mockados — a tela
// renderiza vazia e o que se observa é o cabeçalho.

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/services/api', () => ({
  usersApi: { list: vi.fn().mockResolvedValue([]) },
  producersApi: { list: vi.fn().mockResolvedValue([]) },
  rolesApi: { list: vi.fn().mockResolvedValue([]) },
  tenantsApi: { create: vi.fn() },
}))

import { AdminPage } from './AdminPage'

const tenant = { id: 'c1', name: 'Flor de Quilombo' }

function montar(acesso: User['acesso']) {
  mockUseAuth.mockReturnValue({
    tenant,
    tenants: [tenant],
    user: { id: 'u1', name: 'Admin', acesso },
    refreshUser: vi.fn(),
  })
  return render(<AdminPage />)
}

const botao = (nome: string) => screen.queryByRole('button', { name: new RegExp(nome, 'i') })

beforeEach(() => vi.clearAllMocks())

describe('AdminPage — ação principal por aba', () => {
  it('aba clientes: Novo Cliente e Importar CSV', async () => {
    montar('admin')
    expect(await screen.findByRole('button', { name: /Novo Cliente/i })).toBeInTheDocument()
    expect(botao('Importar CSV')).toBeInTheDocument()
    expect(botao('Novo Fornecedor')).not.toBeInTheDocument()
  })

  it('aba fornecedores: troca para Novo Fornecedor e some o Importar CSV', async () => {
    const user = userEvent.setup()
    montar('admin')
    await user.click(await screen.findByRole('tab', { name: 'Fornecedores' }))

    expect(botao('Novo Fornecedor')).toBeInTheDocument()
    expect(botao('Novo Cliente')).not.toBeInTheDocument()
    // Importar CSV é ação da aba clientes — não pode vazar para as outras
    expect(botao('Importar CSV')).not.toBeInTheDocument()
  })

  it('aba configurações: nenhuma ação no cabeçalho', async () => {
    const user = userEvent.setup()
    montar('admin')
    await user.click(await screen.findByRole('tab', { name: 'Configurações' }))

    expect(botao('Novo Cliente')).not.toBeInTheDocument()
    expect(botao('Novo Fornecedor')).not.toBeInTheDocument()
    expect(botao('Importar CSV')).not.toBeInTheDocument()
    expect(botao('Nova Organização')).not.toBeInTheDocument()
  })

  it('superadmin: aba organizações existe e mostra Nova Organização', async () => {
    const user = userEvent.setup()
    montar('superadmin')
    await user.click(await screen.findByRole('tab', { name: 'Organizações' }))

    expect(botao('Nova Organização')).toBeInTheDocument()
    expect(botao('Novo Cliente')).not.toBeInTheDocument()
  })

  it('admin comum não vê a aba padarias', async () => {
    montar('admin')
    expect(await screen.findByRole('tab', { name: 'Clientes' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Organizações' })).not.toBeInTheDocument()
  })

  it('volta para Novo Cliente ao retornar à aba clientes', async () => {
    const user = userEvent.setup()
    montar('admin')
    await user.click(await screen.findByRole('tab', { name: 'Fornecedores' }))
    await user.click(screen.getByRole('tab', { name: 'Clientes' }))

    expect(botao('Novo Cliente')).toBeInTheDocument()
    expect(botao('Novo Fornecedor')).not.toBeInTheDocument()
  })
})
