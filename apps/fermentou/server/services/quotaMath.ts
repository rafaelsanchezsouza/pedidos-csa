// Resolução de preço de cota — módulo puro (sem IO), testável isoladamente.
// User.quota guarda o NOME do tier; o preço vem de Tenant.quotas (ou do legado inteira/meia).

export interface QuotaTier { name: string; price: number }

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
