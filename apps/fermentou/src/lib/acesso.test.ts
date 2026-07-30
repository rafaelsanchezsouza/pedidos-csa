import { describe, it, expect } from 'vitest'
import { tipoDeAcesso, montarAcesso } from './acesso'

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
