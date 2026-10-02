// Puro, sem IO — para ser testável sem subir o firebase-admin (mesmo motivo do week).

export interface PrecoBairro {
  bairro: string
  price: number
}

/**
 * De onde saiu o valor do frete. É discriminado, e não um número, porque "não definido" e
 * "grátis" precisam ser coisas diferentes: com tabela por bairro, devolver 0 para quem não
 * tem preço faria a entrega sair de graça em silêncio. Indefinido vira pendência.
 */
export type FreteDoMembro =
  | { origem: 'membro'; valor: number }
  | { origem: 'bairro'; valor: number; bairro: string }
  | { origem: 'padrao'; valor: number }
  | { origem: 'indefinido' }

/**
 * Bairro é texto digitado (cadastro antigo, import de CSV, formulário). "Manaíra", "manaira"
 * e "MANAÍRA " são o mesmo bairro e têm de cobrar o mesmo valor — comparar cru cobraria
 * errado de quem digitou diferente.
 */
export function normalizarBairro(nome: string | undefined): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Precedência: override do membro → preço do bairro → padrão do tenant → indefinido.
 *
 * O override vem primeiro e `0` explícito nele é entrega grátis (por isso `!== undefined`, e
 * não `||`). O padrão do tenant só entra se for > 0: a CSA tem 0 gravado de quando o campo
 * nasceu, e deixá-lo valer faria todo mundo virar "frete grátis" em vez de pendência.
 */
export function freteDoMembro(
  user: { freteDelivery?: number; neighborhood?: string },
  tenant: { freteDelivery?: number; fretePorBairro?: PrecoBairro[] } | null,
): FreteDoMembro {
  if (user.freteDelivery !== undefined) return { origem: 'membro', valor: user.freteDelivery }

  const alvo = normalizarBairro(user.neighborhood)
  if (alvo) {
    const achado = (tenant?.fretePorBairro ?? []).find((b) => normalizarBairro(b.bairro) === alvo)
    if (achado) return { origem: 'bairro', valor: achado.price, bairro: achado.bairro }
  }

  const padrao = tenant?.freteDelivery
  if (padrao !== undefined && padrao > 0) return { origem: 'padrao', valor: padrao }

  return { origem: 'indefinido' }
}

/** Valor efetivo. Indefinido vira 0 — quem precisa distinguir usa `freteDoMembro`. */
export function resolveFrete(
  user: { freteDelivery?: number; neighborhood?: string },
  tenant: { freteDelivery?: number; fretePorBairro?: PrecoBairro[] } | null,
): number {
  const f = freteDoMembro(user, tenant)
  return f.origem === 'indefinido' ? 0 : f.valor
}
