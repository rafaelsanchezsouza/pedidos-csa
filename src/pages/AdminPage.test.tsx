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
  colmeiasApi: { create: vi.fn() },
}))

import { AdminPage } from './AdminPage'

const colmeia = { id: 'c1', name: 'Flor de Quilombo' }

function montar(acesso: User['acesso']) {
  mockUseAuth.mockReturnValue({
    colmeia,
    colmeias: [colmeia],
    user: { id: 'u1', name: 'Admin', acesso },
    refreshUser: vi.fn(),
  })
  return render(<AdminPage />)
}

const botao = (nome: string) => screen.queryByRole('button', { name: new RegExp(nome, 'i') })

beforeEach(() => vi.clearAllMocks())

describe('AdminPage — ação principal por aba', () => {
  it('aba usuários: Novo Membro e Importar CSV', async () => {
    montar('admin')
    expect(await screen.findByRole('button', { name: /Novo Membro/i })).toBeInTheDocument()
    expect(botao('Importar CSV')).toBeInTheDocument()
    expect(botao('Novo Produtor')).not.toBeInTheDocument()
  })

  it('aba produtores: troca para Novo Produtor e some o Importar CSV', async () => {
    const user = userEvent.setup()
    montar('admin')
    await user.click(await screen.findByRole('tab', { name: 'Produtores' }))

    expect(botao('Novo Produtor')).toBeInTheDocument()
    expect(botao('Novo Membro')).not.toBeInTheDocument()
    // Importar CSV é ação da aba usuários — não pode vazar para as outras
    expect(botao('Importar CSV')).not.toBeInTheDocument()
  })

  it('aba configurações: nenhuma ação no cabeçalho', async () => {
    const user = userEvent.setup()
    montar('admin')
    await user.click(await screen.findByRole('tab', { name: 'Configurações' }))

    expect(botao('Novo Membro')).not.toBeInTheDocument()
    expect(botao('Novo Produtor')).not.toBeInTheDocument()
    expect(botao('Importar CSV')).not.toBeInTheDocument()
    expect(botao('Nova Colmeia')).not.toBeInTheDocument()
  })

  it('superadmin: aba colmeias existe e mostra Nova Colmeia', async () => {
    const user = userEvent.setup()
    montar('superadmin')
    await user.click(await screen.findByRole('tab', { name: 'Colmeias' }))

    expect(botao('Nova Colmeia')).toBeInTheDocument()
    expect(botao('Novo Membro')).not.toBeInTheDocument()
  })

  it('admin comum não vê a aba colmeias', async () => {
    montar('admin')
    expect(await screen.findByRole('tab', { name: 'Usuários' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Colmeias' })).not.toBeInTheDocument()
  })

  it('volta para Novo Membro ao retornar à aba usuários', async () => {
    const user = userEvent.setup()
    montar('admin')
    await user.click(await screen.findByRole('tab', { name: 'Produtores' }))
    await user.click(screen.getByRole('tab', { name: 'Usuários' }))

    expect(botao('Novo Membro')).toBeInTheDocument()
    expect(botao('Novo Produtor')).not.toBeInTheDocument()
  })
})
