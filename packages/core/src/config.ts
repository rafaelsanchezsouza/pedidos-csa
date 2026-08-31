// AppConfig — o contrato de configuração por app. É o que separa "motor" de "cliente":
// o engine (server) e a UI (front) recebem este objeto e mudam de comportamento por dados,
// não por fork de código. Carrega só o que é ESTÁTICO e seguro no front (marca, vocabulário,
// capacidades, seeds do tenant). Segredos/env (Firebase, WhatsApp instance, OpenAI key) são
// runtime do server e entram no boot do engine — NÃO ficam aqui.

import type { QuotaTier } from './types.js'

// Identidade visual do tenant. Cores no formato HSL do shadcn ("H S% L%"), por tema.
// O valor (BRAND) e applyBrand() (DOM) ficam no app; aqui só o contrato.
export interface Brand {
  name: string
  tagline: string
  icon: string
  colors: { light: Record<string, string>; dark: Record<string, string> }
}

// De onde vem a oferta da semana: parsing de mensagem do produtor (CSA) ou geração do catálogo.
export type OfferingSource = 'parse-message' | 'from-catalog'
export type MessageParser = 'fuzzy' | 'openai'
export type PaymentStrategy = 'monthly-post' | 'per-order-pix'

// Rótulos de UI que NÃO são por-tenant (os por-tenant, como quotaTerm, vivem no doc do tenant).
export interface AppVocabulary {
  pickupLabel: string // rótulo de deliveryType de retirada na UI ("Retirada" | "Colmeia")
  otpAppName: string  // nome usado na mensagem de OTP (normalmente = brand.name)
}

export interface AppCapabilities {
  offeringSource: OfferingSource
  messageParser?: MessageParser // obrigatório sse offeringSource='parse-message'
  multiTenant: boolean
  paymentStrategy: PaymentStrategy
}

// Seeds usados ao criar o tenant (POST /setup, /tenants). Fim dos hardcodes 40/65/10 e
// 'Flor de Quilombo' no motor.
export interface TenantDefaults {
  quotaTerm: string
  quotas: QuotaTier[]
  quotaInteira: number
  quotaMeia: number
  roleDefaults: string[] // CSA: ['colmeia','coagricultor'] | padaria: []
  dueDay: number
  orderSendDay: number
  orderSendHour: number
  weekChangeDay: number
  /**
   * Offset UTC do tenant, em horas. Ausente = -3 (Brasil; sem horário de verão desde 2019).
   * Existe porque o servidor roda em UTC: qualquer regra com hora do dia (prazo de confirmação
   * da acolhida, envio do pedido) precisa do relógio do MEMBRO, não o do processo.
   */
  utcOffset?: number
}

export interface AppConfig {
  brand: Brand
  vocabulary: AppVocabulary
  capabilities: AppCapabilities
  tenantDefaults: TenantDefaults
}

// Autoria type-safe da config (identidade; só para inferência/checagem no ponto de definição).
export function defineAppConfig(c: AppConfig): AppConfig {
  return c
}

// Valida invariantes que o tipo sozinho não pega. Retorna lista de erros ([] = ok).
export function validateAppConfig(c: AppConfig): string[] {
  const errs: string[] = []
  const cap = c.capabilities
  if (cap.offeringSource === 'parse-message' && !cap.messageParser) {
    errs.push("capabilities.messageParser é obrigatório quando offeringSource='parse-message'")
  }
  if (cap.offeringSource === 'from-catalog' && cap.messageParser) {
    errs.push("capabilities.messageParser não se aplica a offeringSource='from-catalog'")
  }
  if (!c.tenantDefaults.quotas.length) errs.push('tenantDefaults.quotas não pode ser vazio')
  if (!c.vocabulary.otpAppName.trim()) errs.push('vocabulary.otpAppName não pode ser vazio')
  if (!c.vocabulary.pickupLabel.trim()) errs.push('vocabulary.pickupLabel não pode ser vazio')

  const d = c.tenantDefaults
  const range = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi
  if (!range(d.dueDay, 1, 28)) errs.push('tenantDefaults.dueDay deve estar entre 1 e 28')
  if (!range(d.orderSendDay, 0, 6)) errs.push('tenantDefaults.orderSendDay deve estar entre 0 e 6')
  if (!range(d.orderSendHour, 0, 23)) errs.push('tenantDefaults.orderSendHour deve estar entre 0 e 23')
  if (!range(d.weekChangeDay, 0, 6)) errs.push('tenantDefaults.weekChangeDay deve estar entre 0 e 6')
  if (d.utcOffset !== undefined && !range(d.utcOffset, -12, 14)) {
    errs.push('tenantDefaults.utcOffset deve estar entre -12 e 14')
  }
  return errs
}
