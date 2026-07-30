// Puro, sem IO — para ser testável sem subir o firebase-admin (mesmo motivo do weekMath).

// Frete efetivo do membro: override próprio vence o padrão da colmeia. 0 explícito é válido
// (entrega grátis) e vence o padrão — por isso `??` e não `||`.
export function resolveFrete(
  user: { freteDelivery?: number },
  colmeia: { freteDelivery?: number } | null,
): number {
  return user.freteDelivery ?? colmeia?.freteDelivery ?? 0
}
