import type { User } from '@/types'

// Rótulo da cota do membro, com a quantidade quando > 1.
// Ex: { quota: 'Cota inteira', quotaQty: 2 } → "Cota inteira ×2"
//     { quota: 'Meia cota' }                 → "Meia cota" (qty ausente = 1)
//     { }                                     → "" (sem cota)
export function formatQuota(user: Pick<User, 'quota' | 'quotaQty'>): string {
  if (!user.quota) return ''
  const qty = user.quotaQty ?? 1
  return qty > 1 ? `${user.quota} ×${qty}` : user.quota
}
