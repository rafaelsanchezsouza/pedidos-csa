import { describe, it, expect } from 'vitest'
import {
  acessos,
  isSuperadmin,
  isAdmin,
  isFornecedor,
  isConsumidor,
  tipoDeAcesso,
  montarAcesso,
} from './acesso'

describe('acessos (normalização + dual-mode)', () => {
  it('lista já canônica passa direto', () => {
    expect(acessos(['admin', 'consumidor'])).toEqual(['admin', 'consumidor'])
  })

  it('normaliza rótulos legados da CSA (user→consumidor, produtor→fornecedor)', () => {
    expect(acessos('user')).toEqual(['consumidor'])
    expect(acessos('produtor')).toEqual(['fornecedor'])
    expect(acessos(['user', 'admin'])).toEqual(['consumidor', 'admin'])
  })

  it('string única legada (admin/superadmin) vira lista', () => {
    expect(acessos('admin')).toEqual(['admin'])
    expect(acessos('superadmin')).toEqual(['superadmin'])
  })

  it('aceita o objeto User (front) e o campo cru (server) — mesma resposta', () => {
    expect(acessos({ acesso: ['admin'] })).toEqual(['admin'])
    expect(acessos({ acesso: 'produtor' })).toEqual(['fornecedor'])
    expect(acessos(['admin'])).toEqual(['admin'])
  })

  it('vazio / ausente → []', () => {
    expect(acessos(undefined)).toEqual([])
    expect(acessos(null)).toEqual([])
    expect(acessos({})).toEqual([])
    expect(acessos({ acesso: undefined })).toEqual([])
  })
})

describe('predicados (via user e via cru)', () => {
  it('isAdmin cobre admin e superadmin', () => {
    expect(isAdmin({ acesso: ['admin'] })).toBe(true)
    expect(isAdmin('superadmin')).toBe(true)
    expect(isAdmin('user')).toBe(false)
  })
  it('isSuperadmin só superadmin', () => {
    expect(isSuperadmin(['superadmin'])).toBe(true)
    expect(isSuperadmin(['admin'])).toBe(false)
  })
  it('isFornecedor normaliza produtor legado', () => {
    expect(isFornecedor('produtor')).toBe(true)
    expect(isFornecedor({ acesso: ['fornecedor'] })).toBe(true)
  })
  it('isConsumidor normaliza user legado', () => {
    expect(isConsumidor('user')).toBe(true)
    expect(isConsumidor({ acesso: ['consumidor'] })).toBe(true)
  })
})

describe('tipoDeAcesso', () => {
  it('consumidor → cliente (mesmo com admin junto)', () => {
    expect(tipoDeAcesso(['consumidor'])).toBe('cliente')
    expect(tipoDeAcesso(['consumidor', 'admin'])).toBe('cliente')
  })
  it('fornecedor → fornecedor', () => {
    expect(tipoDeAcesso(['fornecedor', 'admin'])).toBe('fornecedor')
  })
  it('só admin/superadmin → admin', () => {
    expect(tipoDeAcesso(['admin'])).toBe('admin')
    expect(tipoDeAcesso(['superadmin'])).toBe('admin')
  })
})

describe('montarAcesso', () => {
  it('cliente sem admin', () => {
    expect(montarAcesso('cliente', false, [])).toEqual(['consumidor'])
  })
  it('cliente + admin', () => {
    expect(montarAcesso('cliente', true, [])).toEqual(['consumidor', 'admin'])
  })
  it('fornecedor e cliente são mutuamente exclusivos', () => {
    // partindo de um cliente, virar fornecedor não mantém consumidor
    expect(montarAcesso('fornecedor', false, ['consumidor'])).toEqual(['fornecedor'])
  })
  it('somente administrador', () => {
    expect(montarAcesso('admin', false, [])).toEqual(['admin'])
  })
  it('preserva superadmin do registro original', () => {
    expect(montarAcesso('cliente', false, ['superadmin', 'admin'])).toEqual(['superadmin', 'consumidor'])
    expect(montarAcesso('admin', true, ['superadmin'])).toEqual(['superadmin', 'admin'])
  })
})
