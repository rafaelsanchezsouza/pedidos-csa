// Ciclo de semana / quinzena — módulo puro ÚNICO (client + server).
//
// Antes vivia duplicado em cada app: `src/lib/weekUtils.ts` (API por string 'YYYY-MM-DD',
// usada no client) e `server/services/weekMath.ts` (API por Date, usada no server). O rootDir
// do tsconfig do server impedia importar de `src/`, então a regra do ciclo quinzenal ficava
// em 4 cópias. No monorepo client e server consomem este módulo. As duas APIs coexistem e o
// teste cruza uma contra a outra — foi exatamente a divergência client×server que gerou o #43
// (a UI dizia "não pega nesta semana" e a cobrança contava a semana).

// Âncora do ciclo quinzenal: segunda-feira da semana ISO 1 de 2026.
// A escolha não é livre — é a única (mod 2) que reproduz exatamente a paridade ISO que
// vigorava antes do #48, então nenhum membro muda de semana ao migrar para o contador.
const ANCORA_QUINZENAL = Date.UTC(2025, 11, 29)
const UMA_SEMANA_MS = 7 * 86400000

// Semanas anteriores à âncora dão índice negativo e `-1 % 2` é -1 em JS; protege o módulo.
const parProtegido = (i: number): boolean => ((i % 2) + 2) % 2 === 0

// --- API por string 'YYYY-MM-DD' (client) ---

export function getWeekStart(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Conta as semanas desde a âncora. Contador contínuo em vez do número da semana ISO: a
// semana ISO reseta todo ano e, em ano de 53 semanas (2026, 2032...), a paridade repete na
// virada — dois ciclos "ímpares" seguidos quebravam a alternância quinzenal (#48).
//
// weekStart é 'YYYY-MM-DD' e os componentes são parseados na mão: `new Date('YYYY-MM-DD')`
// resolve para meia-noite UTC e, lido com getters locais em fuso negativo (BR), recua um
// dia — era o que invertia a paridade de todo mundo (#43).
export function getWeekIndex(weekStart: string): number {
  const [year, month, day] = weekStart.split('-').map(Number)
  return Math.round((Date.UTC(year, month - 1, day) - ANCORA_QUINZENAL) / UMA_SEMANA_MS)
}

// Semana de fixo = índice par. Vale para quinzenais sem ciclo definido (fallback).
export function isFixoWeek(weekStart: string): boolean {
  return parProtegido(getWeekIndex(weekStart))
}

// Determina se a semana é de entrega para o usuário considerando seu ciclo individual
export function isUserDeliveryWeek(
  user: { frequency: 'semanal' | 'quinzenal'; quinzenalParity?: 'par' | 'impar' },
  weekStart: string,
): boolean {
  if (user.frequency === 'semanal') return true
  const fixo = isFixoWeek(weekStart)
  if (user.quinzenalParity === 'impar') return fixo
  if (user.quinzenalParity === 'par') return !fixo
  return fixo // fallback: comportamento global
}

// Retorna a quarta-feira da semana (dia de entrega) a partir do weekStart (segunda)
export function getWeekDelivery(weekStart: string): string {
  const d = new Date(weekStart + 'T12:00:00')
  d.setDate(d.getDate() + 2)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Semana presente. Se hoje é weekChangeDay, avança para a próxima segunda (mostra semana seguinte).
// weekChangeDay: 0=Dom (padrão), 1=Seg, ..., 6=Sáb
export function getPresentWeekId(weekChangeDay = 0): string {
  const d = new Date()
  if (d.getDay() === weekChangeDay) {
    const daysToNextMonday = ((1 - d.getDay() + 7) % 7) || 7
    d.setDate(d.getDate() + daysToNextMonday)
  }
  return getWeekStart(d)
}

export function shiftWeek(weekStart: string, delta: number): string {
  const d = new Date(weekStart + 'T12:00:00')
  d.setDate(d.getDate() + delta * 7)
  return getWeekStart(d)
}

export function formatDeliveryDate(weekStart: string): string {
  const delivery = getWeekDelivery(weekStart)
  const [, m, d] = delivery.split('-')
  return `${d}/${m}`
}

export function weekOptions(count = 8): string[] {
  const weeks: string[] = []
  const start = new Date(getPresentWeekId() + 'T12:00:00')
  for (let i = 0; i < count; i++) {
    weeks.push(getWeekStart(start))
    start.setDate(start.getDate() - 7)
  }
  return weeks
}

// --- API por Date (server) ---
// O server monta a Date a partir de componentes locais (new Date(y, m, d), como o
// countDeliveryWeeks do paymentService); estas funções têm que chegar no MESMO índice que a
// API por string. O teste cruzado garante isso semana a semana.

export function getWeekIndexFromDate(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((utc - ANCORA_QUINZENAL) / UMA_SEMANA_MS)
}

export function isFixoWeekFromDate(date: Date): boolean {
  return parProtegido(getWeekIndexFromDate(date))
}

// Nº de entregas do mês para a frequência do membro (semanal = toda semana; quinzenal =
// semanas do seu ciclo). Uma semana conta se a QUARTA (dia de entrega, segunda+2 — mesma
// convenção de getWeekDelivery) cai dentro do mês. Vivia duplicado no paymentService dos
// dois apps; é a base da cobrança mensal (cota e frete).
export function countDeliveryWeeks(
  month: string, // 'YYYY-MM'
  frequency: 'semanal' | 'quinzenal',
  quinzenalParity?: 'par' | 'impar',
): number {
  const [year, monthNum] = month.split('-').map(Number) as [number, number]
  let count = 0
  const firstDay = new Date(year, monthNum - 1, 1)
  const dayOfWeek = firstDay.getDay()
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const cur = new Date(year, monthNum - 1, 1 + daysToMonday)
  while (true) {
    const wednesday = new Date(cur)
    wednesday.setDate(cur.getDate() + 2)
    if (wednesday.getFullYear() > year || (wednesday.getFullYear() === year && wednesday.getMonth() + 1 > monthNum)) break
    if (wednesday.getMonth() + 1 === monthNum) {
      if (frequency === 'semanal') {
        count++
      } else {
        const fixo = isFixoWeekFromDate(cur)
        if (quinzenalParity === 'impar' && fixo) count++
        else if (quinzenalParity === 'par' && !fixo) count++
        else if (!quinzenalParity && fixo) count++ // fallback: comportamento global
      }
    }
    cur.setDate(cur.getDate() + 7)
  }
  return count
}

/**
 * Em qual ciclo quinzenal cai uma data — o que o membro informa como "minha primeira entrega".
 * Semana de fixo (índice par) = ciclo 'impar' no vocabulário do `isUserDeliveryWeek`, que é
 * quem consome isto; os dois nomes vêm do dado legado e mudá-los agora reclassificaria
 * membro em produção.
 */
export function paridadeDaSemanaDe(dataISO: string): 'par' | 'impar' {
  const [ano, mes, dia] = dataISO.split('-').map(Number) as [number, number, number]
  const semana = getWeekStart(new Date(ano, mes - 1, dia, 12))
  return isFixoWeek(semana) ? 'impar' : 'par'
}

/**
 * Relógio de parede do tenant a partir de um instante — dia da semana, hora e data.
 *
 * Existe porque o servidor roda em UTC e os membros vivem em BRT: `now.getHours()` no processo
 * responde 3 horas à frente do relógio de quem usa o app. Era assim que o envio do pedido ao
 * produtor, configurado para 6h, saía às 3h da manhã.
 *
 * Desloca o instante e lê com getters UTC — assim o resultado não depende do fuso do processo,
 * e o `test:tz` prova isso em BR/UTC/UTC+14.
 */
export function relogioDoTenant(
  agora: Date,
  utcOffset: number,
): { data: string; diaDaSemana: number; hora: number } {
  const d = new Date(agora.getTime() + utcOffset * 3600_000)
  return { data: d.toISOString().slice(0, 10), diaDaSemana: d.getUTCDay(), hora: d.getUTCHours() }
}

/** Semana corrente no fuso do tenant (segunda-feira, 'YYYY-MM-DD'). */
export function semanaDoTenant(agora: Date, utcOffset: number): string {
  const [ano, mes, dia] = relogioDoTenant(agora, utcOffset).data.split('-').map(Number) as [number, number, number]
  return getWeekStart(new Date(ano, mes - 1, dia, 12))
}
