// Config do app CSA. Fonte única do que difere do motor.
// Integrações/env (Firebase, WhatsApp instance, OpenAI key) NÃO ficam aqui — entram no boot do
// server a partir do .env.
//
// Os valores abaixo são os que HOJE estão hardcoded na CSA (paleta do index.css, seeds do POST
// /colmeias, defaults dos jobs). Declarar não muda nada: enquanto a CSA não adotar as rotas do
// engine (task 6, depois da migração canônica), esta config só existe para ser injetada.
// A paleta ainda vive no index.css — quem a aplica é o CSS, não applyBrand; a troca vem junto
// com core/ui.

// Extensão .js nos relativos: este arquivo também será compilado pelo tsc node16 do server
// quando o boot injetar a config no engine; o Vite resolve .js → .ts normalmente.
import { defineAppConfig, type Brand } from '@pedidos/core'

// Paleta atual da CSA (shadcn default + verde). Espelha src/index.css — mantenha em sincronia
// até core/ui assumir a aplicação via applyBrand.
const verde = '142.1 76.2% 36.3%'

export const BRAND: Brand = {
  name: 'Pedidos CSA',
  tagline: 'Comunidade que Sustenta a Agricultura',
  icon: '/leaf.svg',
  colors: {
    light: {
      background: '0 0% 100%',
      foreground: '222.2 84% 4.9%',
      card: '0 0% 100%',
      'card-foreground': '222.2 84% 4.9%',
      popover: '0 0% 100%',
      'popover-foreground': '222.2 84% 4.9%',
      primary: verde,
      'primary-foreground': '355.7 100% 97.3%',
      secondary: '210 40% 96.1%',
      'secondary-foreground': '222.2 47.4% 11.2%',
      muted: '210 40% 96.1%',
      'muted-foreground': '215.4 16.3% 46.9%',
      accent: '210 40% 96.1%',
      'accent-foreground': '222.2 47.4% 11.2%',
      destructive: '0 84.2% 60.2%',
      'destructive-foreground': '210 40% 98%',
      border: '214.3 31.8% 91.4%',
      input: '214.3 31.8% 91.4%',
      ring: verde,
    },
    dark: {
      background: '222.2 84% 4.9%',
      foreground: '210 40% 98%',
      card: '222.2 84% 4.9%',
      'card-foreground': '210 40% 98%',
      popover: '222.2 84% 4.9%',
      'popover-foreground': '210 40% 98%',
      primary: '142.1 70.6% 45.3%',
      'primary-foreground': '144.9 80.4% 10%',
      secondary: '217.2 32.6% 17.5%',
      'secondary-foreground': '210 40% 98%',
      muted: '217.2 32.6% 17.5%',
      'muted-foreground': '215 20.2% 65.1%',
      accent: '217.2 32.6% 17.5%',
      'accent-foreground': '210 40% 98%',
      destructive: '0 62.8% 30.6%',
      'destructive-foreground': '210 40% 98%',
      border: '217.2 32.6% 17.5%',
      input: '217.2 32.6% 17.5%',
      ring: '142.4 71.8% 29.2%',
    },
  },
}

export const config = defineAppConfig({
  brand: BRAND,
  vocabulary: {
    // A CSA chama a não-entrega de "Colmeia" (o ponto de retirada é a casa da anfitriã).
    // É só rótulo de UI: o motor grava o canônico 'retirada' e só pergunta isEntrega(u).
    pickupLabel: 'Colmeia',
    otpAppName: BRAND.name,
  },
  capabilities: {
    // A oferta nasce da mensagem do produtor no WhatsApp (o cardápio muda toda semana).
    offeringSource: 'parse-message',
    messageParser: 'fuzzy', // 'openai' exige injetar o adapter no boot (dep openai só neste app)
    multiTenant: true, // várias colmeias, com superadmin trocando entre elas
    paymentStrategy: 'monthly-post',
  },
  tenantDefaults: {
    quotaTerm: 'Cota',
    quotas: [
      { name: 'Cota inteira', price: 65 },
      { name: 'Meia cota', price: 40 },
    ],
    quotaInteira: 65,
    quotaMeia: 40,
    roleDefaults: ['colmeia', 'coagricultor'], // função no coletivo (vocabulário da CSA)
    dueDay: 10,
    orderSendDay: 2, // terça
    orderSendHour: 6,
    weekChangeDay: 0, // domingo
    utcOffset: -3,  // servidor roda em UTC; a regra usa o relógio do membro
  },
})
