import { describe, it, expect } from 'vitest'
import { parseCsvLine, parsePrice } from './csv'

describe('parseCsvLine', () => {
  it('separa campos simples', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })
  it('respeita aspas com vírgula interna', () => {
    expect(parseCsvLine('"Alface, crespa",unid,4')).toEqual(['Alface, crespa', 'unid', '4'])
  })
  it('desescapa aspas duplas', () => {
    expect(parseCsvLine('"aspas ""aqui""",x')).toEqual(['aspas "aqui"', 'x'])
  })
})

describe('parsePrice', () => {
  it('vírgula como decimal BR', () => {
    expect(parsePrice('R$ 1,20')).toBe(1.2)
  })
  it('ponto como decimal', () => {
    expect(parsePrice('12.00')).toBe(12)
  })
  it('ponto de milhar + vírgula decimal', () => {
    expect(parsePrice('1.234,50')).toBe(1234.5)
  })
  it('vazio vira 0', () => {
    expect(parsePrice('')).toBe(0)
  })
})
