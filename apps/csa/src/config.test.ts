import { describe, it, expect } from 'vitest'
import { validateAppConfig } from '@pedidos/core'
import { config, BRAND } from './config'

describe('config da CSA', () => {
  it('passa na validação do AppConfig', () => {
    expect(validateAppConfig(config)).toEqual([])
  })

  it('gera a oferta pelo parse da mensagem do produtor', () => {
    expect(config.capabilities.offeringSource).toBe('parse-message')
    expect(config.capabilities.messageParser).toBe('fuzzy')
  })

  it('vocabulário da CSA', () => {
    expect(config.tenantDefaults.quotaTerm).toBe('Cota')
    expect(config.tenantDefaults.roleDefaults).toEqual(['colmeia', 'coagricultor'])
    expect(config.vocabulary.pickupLabel).toBe('Colmeia')
  })

  it('os tiers de cota batem com os valores legados quotaInteira/quotaMeia', () => {
    const { quotas, quotaInteira, quotaMeia } = config.tenantDefaults
    expect(quotas.find((q) => q.name === 'Cota inteira')?.price).toBe(quotaInteira)
    expect(quotas.find((q) => q.name === 'Meia cota')?.price).toBe(quotaMeia)
  })

  // Até core/ui assumir o applyBrand, a paleta vive em DOIS lugares: aqui e no index.css
  // (que é quem pinta a tela hoje). Comparar com o CSS de verdade exigiria ler o arquivo, e
  // dar tipos de Node ao tsconfig do front custa mais do que vale — o index.css carrega o
  // aviso de sincronia. Aqui fica só a sanidade estrutural.
  it('a paleta cobre as mesmas variáveis nos dois temas', () => {
    expect(Object.keys(BRAND.colors.dark).sort()).toEqual(Object.keys(BRAND.colors.light).sort())
    expect(Object.keys(BRAND.colors.light)).toContain('primary')
  })
})
