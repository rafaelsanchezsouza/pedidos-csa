import type { User } from '../types.js'

// A ÚNICA pergunta que o motor faz sobre deliveryType: recebe em casa? Frete e rota de entrega
// existem só para 'entrega'. O token de não-entrega ('retirada'; 'colmeia' no dado legado da
// CSA) é vocabulário de UI e nunca decide regra — por isso o parâmetro é string solta e o
// predicado testa só o canônico 'entrega'.
export const isEntrega = (u: { deliveryType?: string }): boolean => u.deliveryType === 'entrega'

// Ordena a lista de entrega: quem tem deliveryOrder vem primeiro (crescente); quem não tem
// (membro novo) cai no fim, em ordem alfabética. Nome desempata em qualquer caso.
export function sortByDeliveryOrder<T extends Pick<User, 'name' | 'deliveryOrder'>>(users: T[]): T[] {
  return [...users].sort((a, b) => {
    const ao = a.deliveryOrder
    const bo = b.deliveryOrder
    if (ao != null && bo != null && ao !== bo) return ao - bo
    if (ao != null && bo == null) return -1
    if (ao == null && bo != null) return 1
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

// A lista de entrega é filtrada por semana (quinzenais somem em algumas). Ao reordenar numa
// semana com membros ocultos, precisamos gravar a ordem do conjunto INTEIRO sem bagunçar a
// posição de quem não apareceu. Estratégia: percorrer a ordem atual completa e, em cada
// posição que era de um membro visível, encaixar o próximo id da nova ordem visível; posições
// de ocultos ficam intactas.
//
// Retorna a lista completa de ids na nova ordem, pronta para o backend gravar como 0..n-1.
export function mergeReorder(
  allEntrega: Array<Pick<User, 'id' | 'name' | 'deliveryOrder'>>,
  visibleIdsNewOrder: string[],
): string[] {
  const fullSorted = sortByDeliveryOrder(allEntrega)
  const visibleSet = new Set(visibleIdsNewOrder)
  let cursor = 0
  return fullSorted.map((u) => {
    if (visibleSet.has(u.id)) {
      const next = visibleIdsNewOrder[cursor]
      cursor += 1
      return next
    }
    return u.id
  })
}
