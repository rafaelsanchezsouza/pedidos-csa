// Resolução de preço de cota — módulo puro (sem IO), testável isoladamente.
// User.quota guarda o NOME do tier; o preço vem de Tenant.quotas (ou do legado inteira/meia).
// quotaAmount fecha o cálculo mensal: taxa semanal × nº de cotas × nº de entregas.

import type { QuotaTier } from '../types.js'

export interface QuotaSettings {
  quotas?: QuotaTier[]
  quotaInteira?: number
  quotaMeia?: number
}

// Tiers efetivos do tenant: usa quotas dinâmicas; se ausentes, deriva do legado inteira/meia.
export function tiersDoTenant(t?: QuotaSettings | null): QuotaTier[] {
  if (t?.quotas?.length) return t.quotas
  return [
    { name: 'Cota inteira', price: t?.quotaInteira ?? 65 },
    { name: 'Meia cota', price: t?.quotaMeia ?? 40 },
  ]
}

// Preço semanal (R$) do tier que o usuário possui; fallback = cota inteira legada.
export function weeklyRate(quota: string | undefined, t?: QuotaSettings | null): number {
  const tier = tiersDoTenant(t).find((q) => q.name === quota)
  return tier?.price ?? (t?.quotaInteira ?? 65)
}

// Valor da cota mensal: taxa semanal × quantidade de cotas (padrão 1) × nº de entregas do mês.
// quotaQty ausente = 1 (membros antigos, sem o campo, seguem cobrando 1 cota). Vem da CSA (#45).
export function quotaAmount(rate: number, quotaQty: number | undefined, weeks: number): number {
  return rate * (quotaQty ?? 1) * weeks
}
