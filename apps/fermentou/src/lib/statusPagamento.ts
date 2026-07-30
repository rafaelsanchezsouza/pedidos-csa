import type { Payment } from '@/types'

export type VarianteBadge = 'default' | 'secondary' | 'destructive'

// Estados da fatura, na ordem em que se sobrepõem: verificado vence comprovante,
// comprovante vence pendente. Ver "Pagamentos" em BUSINESS_RULES.md.
export function statusLabel(p: Payment): string {
  if (p.verified) return 'Verificado'
  if (p.proofUrl) return 'Aguardando verificação'
  return 'Pendente'
}

export function statusVariant(p: Payment): VarianteBadge {
  if (p.verified) return 'default'
  if (p.proofUrl) return 'secondary'
  return 'destructive'
}
