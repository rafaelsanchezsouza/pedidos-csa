// Cálculo puro da cota mensal (sem I/O) — testável isolado, no padrão de freteMath.
// Valor = taxa semanal × quantidade de cotas (padrão 1) × nº de entregas do mês.
// quotaQty ausente = 1 (membros antigos, sem o campo, seguem cobrando 1 cota).
export function quotaAmount(weeklyRate: number, quotaQty: number | undefined, weeks: number): number {
  return weeklyRate * (quotaQty ?? 1) * weeks
}
