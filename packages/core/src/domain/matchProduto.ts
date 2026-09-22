// Correspondência entre um nome digitado/extraído e o catálogo do produtor.
//
// Mora no domínio (e não dentro do parser) porque a regra é a mesma nos dois lados: o
// servidor casa a mensagem crua na geração da oferta, e a tela reconfere quando o operador
// corrige um nome à mão. Duas implementações = feedback mentiroso na tela.

export interface ProdutoCatalogo {
  id: string
  name: string
}

/** Abaixo disso não é correspondência — é produto novo. */
export const LIMIAR_MATCH = 0.7

export function normalizarNome(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** 0..1 — Levenshtein normalizado pelo maior nome. */
export function similaridadeNome(a: string, b: string): number {
  const na = normalizarNome(a)
  const nb = normalizarNome(b)
  if (na === nb) return 1
  if (!na || !nb) return 0
  const dist = levenshtein(na, nb)
  return 1 - dist / Math.max(na.length, nb.length)
}

/** Melhor produto do catálogo acima do limiar, ou undefined (produto novo). */
export function melhorMatch<T extends ProdutoCatalogo>(nome: string, catalogo: T[]): T | undefined {
  if (!nome.trim()) return undefined
  let melhor: { produto: T; score: number } | undefined
  for (const p of catalogo) {
    const score = similaridadeNome(nome, p.name)
    if (score >= LIMIAR_MATCH && (!melhor || score > melhor.score)) {
      melhor = { produto: p, score }
    }
  }
  return melhor?.produto
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
    }
  }
  return dp[m]![n]!
}
