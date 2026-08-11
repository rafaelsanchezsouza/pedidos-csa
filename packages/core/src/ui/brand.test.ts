// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyBrand } from './brand'
import type { Brand } from '../config'

const brand: Brand = {
  name: 'Loja X',
  tagline: 't',
  icon: '/x.svg',
  colors: {
    light: { background: '0 0% 100%', primary: '142 76% 36%' },
    dark: { background: '222 84% 5%', primary: '142 71% 45%' },
  },
}

// Finge a preferência de tema do sistema.
function sistemaEscuro(escuro: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: escuro && q.includes('dark') }))
}

beforeEach(() => {
  document.documentElement.removeAttribute('style')
  document.head.innerHTML = '<link rel="icon" href="/antigo.svg">'
})

const varDoRoot = (n: string) => document.documentElement.style.getPropertyValue(`--${n}`)

describe('applyBrand', () => {
  it('escreve a paleta clara nas CSS variables, o título e o favicon', () => {
    sistemaEscuro(false)
    applyBrand(brand, 'light')
    expect(varDoRoot('background')).toBe('0 0% 100%')
    expect(varDoRoot('primary')).toBe('142 76% 36%')
    expect(document.title).toBe('Loja X')
    expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.getAttribute('href')).toBe('/x.svg')
  })

  it("'dark' escreve a paleta escura", () => {
    sistemaEscuro(false)
    applyBrand(brand, 'dark')
    expect(varDoRoot('background')).toBe('222 84% 5%')
  })

  // A razão de o tema ser parâmetro obrigatório: os apps fixam 'light' porque nenhum ativa a
  // classe .dark do Tailwind. Se alguém trocar para 'auto', o tema passa a seguir o SO — e
  // este teste mostra exatamente essa diferença.
  it("'light' ignora o sistema em modo escuro; 'auto' o segue", () => {
    sistemaEscuro(true)
    applyBrand(brand, 'light')
    expect(varDoRoot('background')).toBe('0 0% 100%')

    applyBrand(brand, 'auto')
    expect(varDoRoot('background')).toBe('222 84% 5%')
  })

  it('não quebra quando a página não tem favicon', () => {
    sistemaEscuro(false)
    document.head.innerHTML = ''
    expect(() => applyBrand(brand, 'light')).not.toThrow()
    expect(document.title).toBe('Loja X')
  })
})
