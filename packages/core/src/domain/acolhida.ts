// Período de acolhida — o membro novo experimenta a CSA por 30 dias pagando semana a semana,
// em vez de assinar o mês inteiro adiantado.
//
// Todo cálculo de data aqui recebe o **offset UTC do tenant** em vez de usar os getters locais.
// Não é preciosismo: a VM roda em UTC e os membros vivem em BRT. `new Date().getHours()` num
// processo em UTC responde 3 horas à frente do relógio de quem usa o app — é assim que o
// `sendOrdersJob` dispara às 03:00 de Brasília achando que são 6h. Um prazo de "segunda à
// noite" calculado desse jeito cortaria o membro 3 horas cedo, e num domingo de virada de mês
// erraria o dia inteiro.

/** Brasil não tem horário de verão desde 2019, então o offset é constante. */
export const UTC_OFFSET_PADRAO = -3

/** Data de hoje no fuso do tenant, 'YYYY-MM-DD'. Comparar datas vira comparar strings. */
export function hojeNoFuso(agora: Date, utcOffset: number): string {
  const deslocado = new Date(agora.getTime() + utcOffset * 3600_000)
  return deslocado.toISOString().slice(0, 10)
}

/** Está em acolhida hoje? Sem `acolhidaExpiry` = membro efetivo. O dia do vencimento ainda vale. */
export function emAcolhida(
  u: { acolhidaExpiry?: string },
  agora: Date,
  utcOffset: number,
): boolean {
  if (!u.acolhidaExpiry) return false
  return u.acolhidaExpiry >= hojeNoFuso(agora, utcOffset)
}

/**
 * Instante-limite para confirmar a semana: segunda-feira 23:59:59 no fuso do tenant.
 * `weekId` já É a segunda (getWeekStart), então o prazo é o fim do próprio dia do weekId —
 * antes do envio do pedido consolidado ao produtor, que é o que torna a lista irreversível.
 */
export function prazoConfirmacao(weekId: string, utcOffset: number): Date {
  const [ano, mes, dia] = weekId.split('-').map(Number) as [number, number, number]
  // 23 - offset converte a hora local do tenant para UTC; Date.UTC normaliza a virada de dia.
  return new Date(Date.UTC(ano, mes - 1, dia, 23 - utcOffset, 59, 59, 999))
}

export function podeConfirmar(weekId: string, agora: Date, utcOffset: number): boolean {
  return agora.getTime() <= prazoConfirmacao(weekId, utcOffset).getTime()
}

/**
 * Quantas semanas do mês o membro confirmou.
 * A semana pertence ao mês do seu `weekId` (a segunda) — mesma convenção dos pedidos, que
 * filtram por `weekId.startsWith(month)`. Manter as duas iguais evita que uma semana caia num
 * mês na cobrança e noutro na entrega.
 */
export function semanasConfirmadas(
  docs: Array<{ weekId: string; confirmado: boolean }>,
  month: string,
): number {
  return docs.filter((d) => d.confirmado && d.weekId.startsWith(month)).length
}

/**
 * Data de encerramento de uma acolhida que começa agora: hoje + `dias`, no fuso do tenant.
 * Existe para o cadastro e o import por CSV não repetirem a conta — e para ela ser feita no
 * mesmo fuso que `emAcolhida` usa na comparação. Calculada em UTC, a virada do dia num fuso
 * negativo daria um dia a mais ou a menos de acolhida.
 */
export function fimDaAcolhida(agora: Date, utcOffset: number, dias = 30): string {
  return hojeNoFuso(new Date(agora.getTime() + dias * 86400_000), utcOffset)
}

/**
 * Fim da acolhida contada a partir de uma data de início informada (ISO), não de hoje.
 * Quem se inscreveu em 15/08 e só foi importado em 31/08 não deve ganhar duas semanas
 * a mais de período de experiência.
 */
export function fimDaAcolhidaDesde(inicioISO: string, dias = 30): string {
  const [ano, mes, dia] = inicioISO.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10)
}
