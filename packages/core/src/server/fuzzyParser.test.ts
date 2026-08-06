import { describe, it, expect } from 'vitest'
import { fuzzyMessageParser } from './fuzzyParser'
import type { ExistingProduct } from './parseMessage'

const catalog: ExistingProduct[] = [
  { id: 'p1', name: 'Alface', unit: 'unid', price: 4 },
  { id: 'p2', name: 'Couve manteiga', unit: 'maço', price: 5 },
  { id: 'p3', name: 'Banana prata', unit: 'kg', price: 7.5 },
]

describe('fuzzyMessageParser', () => {
  it('mensagem com seções: fixo até "alimentos extra", ignora saudação e cabeçalhos', async () => {
    const msg = [
      'Bom dia!',
      'Os alimentos disponível dessa semana:',
      'Alface 4,00',
      'Couve manteiga (maço) 5,00',
      'Alimentos extra:',
      'Banana prata kg 7,50',
    ].join('\n')
    const out = await fuzzyMessageParser(msg, catalog)
    expect(out).toEqual([
      { name: 'Alface', unit: 'unid', price: 4, type: 'fixo', matchedProductId: 'p1' },
      { name: 'Couve manteiga', unit: 'maco', price: 5, type: 'fixo', matchedProductId: 'p2' },
      { name: 'Banana prata', unit: 'kg', price: 7.5, type: 'extra', matchedProductId: 'p3' },
    ])
  })

  it('"Boa tarde Extra" no início marca tudo como extra', async () => {
    const msg = ['Boa tarde Extra', 'Alface 4,00'].join('\n')
    const out = await fuzzyMessageParser(msg, catalog)
    expect(out).toEqual([
      { name: 'Alface', unit: 'unid', price: 4, type: 'extra', matchedProductId: 'p1' },
    ])
  })

  it('sem seções tudo é extra; preços R$ e em parênteses; sem preço vira 0', async () => {
    const msg = ['Tomate R$ 6,50', 'Rúcula (3.00)', 'Cheiro verde'].join('\n')
    const out = await fuzzyMessageParser(msg, [])
    expect(out).toEqual([
      { name: 'Tomate', unit: 'unid', price: 6.5, type: 'extra' },
      { name: 'Rúcula', unit: 'unid', price: 3, type: 'extra' },
      { name: 'Cheiro verde', unit: 'unid', price: 0, type: 'extra' },
    ])
  })

  it('casa com o catálogo tolerando acento/erro de digitação (Levenshtein ≥ 0.7)', async () => {
    const out = await fuzzyMessageParser('Couve mantega 5,00', catalog)
    expect(out[0]).toMatchObject({ matchedProductId: 'p2' })
  })

  it('não inventa match abaixo do limiar', async () => {
    const out = await fuzzyMessageParser('Abobrinha 3,00', catalog)
    expect(out[0]!.matchedProductId).toBeUndefined()
  })

  it('unidade no meio é extraída sem quebrar nome que começa com unidade', async () => {
    const out = await fuzzyMessageParser('Bandeja de jaca 8,00', [])
    expect(out[0]).toMatchObject({ name: 'Bandeja de jaca', unit: 'unid', price: 8 })
  })
})
