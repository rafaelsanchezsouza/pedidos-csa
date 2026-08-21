// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@/types'

// Cobre a amarração form → API do #45: o campo "Qtd" da cota carrega o valor do membro,
// e salvar envia o quotaQty atualizado para usersApi.update. O cálculo do valor em si
// é testado puro em server/services/quotaMath.test.ts; o rótulo em src/lib/quota.test.ts.

// hoisted: vi.mock sobe pro topo do arquivo e não enxerga const de escopo normal.
const { membro, updateSpy } = vi.hoisted(() => ({
  membro: {
    id: 'u1', name: 'André', email: 'andre@ex.com', address: 'Rua 1', neighborhood: 'Centro',
    contact: '11999999999', frequency: 'semanal', deliveryType: 'entrega', tenantId: 'c1',
    acesso: 'user', quota: 'Cota inteira', quotaQty: 2,
  } as User,
  updateSpy: vi.fn().mockResolvedValue({}),
}))

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/services/api', () => ({
  usersApi: { list: vi.fn().mockResolvedValue([membro]), update: updateSpy },
  producersApi: { list: vi.fn().mockResolvedValue([]) },
  rolesApi: { list: vi.fn().mockResolvedValue([]) },
  tenantsApi: { create: vi.fn(), update: vi.fn() },
}))

import { AdminPage } from './AdminPage'

const colmeia = { id: 'c1', name: 'Flor de Quilombo', quotaInteira: 65, quotaMeia: 40 }

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({
    colmeia, colmeias: [colmeia],
    user: { id: 'admin', name: 'Admin', acesso: 'admin' },
    refreshUser: vi.fn(),
  })
})

describe('AdminPage — quantidade de cotas (#45)', () => {
  it('a tabela mostra "Cota inteira ×2" para o membro com quotaQty 2', async () => {
    render(<AdminPage />)
    expect((await screen.findAllByText('Cota inteira ×2'))[0]).toBeInTheDocument()
  })

  it('editar: o campo Qtd carrega o valor e salvar envia o quotaQty atualizado', async () => {
    const user = userEvent.setup()
    render(<AdminPage />)

    // abre o diálogo de edição do membro (há botão no layout desktop e no mobile — pega o 1º)
    await user.click((await screen.findAllByTitle('Editar membro'))[0])

    const dialog = await screen.findByRole('dialog')
    const qtd = within(dialog).getByTitle('Quantidade de cotas') as HTMLInputElement
    expect(qtd.value).toBe('2') // carregou o valor do membro

    // change direto: o input é controlado com clamp Math.max(1,…), então clear+type appendaria
    fireEvent.change(qtd, { target: { value: '3' } })
    expect(qtd.value).toBe('3')
    await user.click(within(dialog).getByRole('button', { name: /^Salvar$/i }))

    expect(updateSpy).toHaveBeenCalledWith('u1', expect.objectContaining({ quotaQty: 3 }), 'c1')
  })
})
