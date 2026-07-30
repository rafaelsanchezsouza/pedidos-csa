// Puro, sem IO — para ser testável sem subir o firebase-admin (mesmo motivo do week).

// Frete efetivo do membro: override próprio vence o padrão do tenant. 0 explícito é válido
// (entrega grátis) e vence o padrão — por isso `??` e não `||`.
export function resolveFrete(
  user: { freteDelivery?: number },
  tenant: { freteDelivery?: number } | null,
): number {
  return user.freteDelivery ?? tenant?.freteDelivery ?? 0
}
