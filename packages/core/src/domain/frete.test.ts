import { describe, it, expect } from 'vitest'
import { freteDoMembro, resolveFrete, normalizarBairro } from './frete'

const tabela = [{ bairro: 'Manaíra', price: 15 }, { bairro: 'Bessa', price: 20 }]

describe('normalizarBairro', () => {
  it('acento, caixa e espaço sobrando são o mesmo bairro', () => {
    const esperado = 'manaira'
    for (const v of ['Manaíra', 'manaira', ' MANAÍRA ', 'Manaíra', 'Mana  íra'.replace('  ', '')]) {
      expect(normalizarBairro(v)).toBe(esperado)
    }
    expect(normalizarBairro('Jardim  Oceania')).toBe('jardim oceania')
    expect(normalizarBairro(undefined)).toBe('')
  })
})

describe('freteDoMembro — precedência', () => {
  it('override do membro vence tudo, e 0 nele é entrega grátis', () => {
    const u = { freteDelivery: 0, neighborhood: 'Manaíra' }
    expect(freteDoMembro(u, { freteDelivery: 30, fretePorBairro: tabela })).toEqual({ origem: 'membro', valor: 0 })
    expect(resolveFrete(u, { fretePorBairro: tabela })).toBe(0)
  })

  it('sem override, vale o preço do bairro — mesmo com grafia diferente', () => {
    expect(freteDoMembro({ neighborhood: ' MANAIRA ' }, { fretePorBairro: tabela }))
      .toEqual({ origem: 'bairro', valor: 15, bairro: 'Manaíra' })
  })

  it('bairro fora da tabela cai no padrão do tenant, se houver', () => {
    expect(freteDoMembro({ neighborhood: 'Cabedelo' }, { freteDelivery: 25, fretePorBairro: tabela }))
      .toEqual({ origem: 'padrao', valor: 25 })
  })

  it('padrão 0 NÃO vale como preço — vira indefinido, não entrega grátis', () => {
    // é o estado da CSA hoje: freteDelivery gravado como 0 desde que o campo nasceu
    expect(freteDoMembro({ neighborhood: 'Cabedelo' }, { freteDelivery: 0, fretePorBairro: tabela }))
      .toEqual({ origem: 'indefinido' })
  })

  it('sem bairro, sem tabela e sem padrão é indefinido', () => {
    expect(freteDoMembro({}, null)).toEqual({ origem: 'indefinido' })
    expect(resolveFrete({}, null)).toBe(0)
  })

  it('bairro na tabela com preço 0 é grátis de propósito, não pendência', () => {
    expect(freteDoMembro({ neighborhood: 'Centro' }, { fretePorBairro: [{ bairro: 'Centro', price: 0 }] }))
      .toEqual({ origem: 'bairro', valor: 0, bairro: 'Centro' })
  })

  it('regressão: quem já usava só o padrão do tenant continua igual', () => {
    expect(resolveFrete({}, { freteDelivery: 12 })).toBe(12)
    expect(resolveFrete({ freteDelivery: 8 }, { freteDelivery: 12 })).toBe(8)
  })
})
