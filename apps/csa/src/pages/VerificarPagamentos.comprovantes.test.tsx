// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Payment } from '@/types'

// Conferência com vários comprovantes no mesmo mês (acolhida). O caso de um comprovante só
// — quase todo mundo — tem que continuar sendo um link direto, sem seletor.

const { fatura, listSpy } = vi.hoisted(() => {
  const fatura = {
    id: 'p1', userId: 'u1', userName: 'Novo', tenantId: 'c1', month: '2026-09',
    producerName: 'Cota', amount: 130, verified: false,
    dateCreated: '', dateUpdated: '',
  } as Payment
  return { fatura, listSpy: vi.fn() }
})

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ colmeia: { id: 'c1', name: 'CSA' }, user: { id: 'a1', acesso: ['admin'] } }),
}))
vi.mock('react-router-dom', () => ({ Navigate: () => null }))
vi.mock('@/services/api', () => ({ paymentsApi: { list: listSpy, update: vi.fn() } }))

import { VerificarPagamentosPage } from './VerificarPagamentosPage'

beforeEach(() => vi.clearAllMocks())

describe('comprovantes na conferência', () => {
  it('vários comprovantes viram seletor de semana', async () => {
    listSpy.mockResolvedValue([{
      ...fatura,
      proofs: [
        { weekId: '2026-09-07', url: 'http://s/1.jpg', dateUploaded: '' },
        { weekId: '2026-09-14', url: 'http://s/2.jpg', dateUploaded: '' },
      ],
    }])
    render(<VerificarPagamentosPage />)

    const seletor = (await screen.findAllByLabelText(/semana do comprovante/i))[0]!
    expect(screen.getAllByRole('link', { name: /^ver$/i })[0]).toHaveAttribute('href', 'http://s/1.jpg')

    await userEvent.selectOptions(seletor, '1')
    expect(screen.getAllByRole('link', { name: /^ver$/i })[0]).toHaveAttribute('href', 'http://s/2.jpg')
  })

  it('um comprovante só continua link direto, sem seletor', async () => {
    listSpy.mockResolvedValue([{ ...fatura, proofUrl: 'http://s/unico.jpg' }])
    render(<VerificarPagamentosPage />)
    expect((await screen.findAllByRole('link', { name: /ver/i }))[0]).toHaveAttribute('href', 'http://s/unico.jpg')
    expect(screen.queryByLabelText(/semana do comprovante/i)).not.toBeInTheDocument()
  })

  it('fatura sem comprovante nenhum não oferece link', async () => {
    listSpy.mockResolvedValue([fatura])
    render(<VerificarPagamentosPage />)
    await screen.findAllByText('—')
    expect(screen.queryByRole('link', { name: /ver/i })).not.toBeInTheDocument()
  })
})
