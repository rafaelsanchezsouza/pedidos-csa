// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@/types'

// Import por CSV entra em acolhida por padrão: quem chega pelo formulário de inscrição é
// novato, e novato paga por semana confirmada. Desmarcar é a exceção (membro que já é de casa).
// A conta dos 30 dias é testada pura em packages/core/src/domain/acolhida.test.ts (×3 fusos).

const { batchSpy, admin } = vi.hoisted(() => ({
  batchSpy: vi.fn().mockResolvedValue({ results: [{ name: 'Rudá', email: 'r@ex.com', success: true }] }),
  admin: { id: 'a1', name: 'Admin', tenantId: 'c1', acesso: ['admin'] } as unknown as User,
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
  'Timestamp,Nome,e-mail,Whatsapp,Logradouro,Complemento,Bairro,CEP,Retirada,Frequência,x,y,Tamanho Cota',
  '2026-08-31 09:00,Rudá,r@ex.com,83999999999,Rua 1,,Centro,58000-000,Colmeia,Semanal,,,Cota inteira',
].join('\n')

async function importar(desmarcar: boolean) {
  render(<AdminPage />)
  await userEvent.click(await screen.findByRole('button', { name: /importar csv/i }))

  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await userEvent.upload(input, new File([CSV], 'membros.csv', { type: 'text/csv' }))

  const check = await screen.findByLabelText(/em acolhida/i)
  expect(check).toBeChecked()                       // padrão
  if (desmarcar) await userEvent.click(check)

  await userEvent.click(screen.getByRole('button', { name: /criar 1 membro/i }))
  await waitFor(() => expect(batchSpy).toHaveBeenCalled())
  return batchSpy.mock.calls[0]![0] as Array<Record<string, unknown>>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({
    colmeia: { id: 'c1', name: 'CSA' }, colmeias: [{ id: 'c1', name: 'CSA' }],
    user: admin, refreshUser: vi.fn(),
  })
})

describe('import por CSV — acolhida', () => {
  it('marcado por padrão: todo mundo entra com data de encerramento', async () => {
    const membros = await importar(false)
    expect(membros[0]!.acolhidaExpiry).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('desmarcado: ninguém recebe acolhida', async () => {
    const membros = await importar(true)
    expect(membros[0]).not.toHaveProperty('acolhidaExpiry')
  })
})
