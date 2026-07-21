// Espelho backend dos predicados de acesso (o server não importa de src/).
// Normaliza string legada ('user'/'produtor') ou lista para lista de Acesso.

export type Acesso = 'superadmin' | 'admin' | 'consumidor' | 'fornecedor'

export function acessos(raw: unknown): Acesso[] {
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : []
  return arr.map((a) => (a === 'user' ? 'consumidor' : a === 'produtor' ? 'fornecedor' : a)) as Acesso[]
}

export const isSuperadmin = (raw: unknown) => acessos(raw).includes('superadmin')
export const isAdmin = (raw: unknown) => {
  const a = acessos(raw)
  return a.includes('admin') || a.includes('superadmin')
}
export const isFornecedor = (raw: unknown) => acessos(raw).includes('fornecedor')
