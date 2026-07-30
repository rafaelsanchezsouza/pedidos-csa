// Níveis de acesso (permissão do login). Um usuário pode ter VÁRIOS ao mesmo tempo.
// Fonte ÚNICA de checagem de permissão (antes duplicada em src/lib/acesso.ts do front e
// server/services/acesso.ts do back). Rótulos legados da CSA ('user'/'produtor', ou o campo
// como string única) são normalizados na leitura — compat com dados já gravados, sem migração.

export type Acesso = 'superadmin' | 'admin' | 'consumidor' | 'fornecedor'

export const ACESSO_LABEL: Record<Acesso, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  consumidor: 'Consumidor',
  fornecedor: 'Fornecedor',
}

// Aceita tanto o valor cru do campo `acesso` (string legada ou lista) quanto um objeto com
// `.acesso` (o próprio User) — assim serve o front (que passa o user) e o server (que passa o
// campo cru) com uma única API.
function rawDe(input: unknown): unknown {
  // Um objeto não-array é um User → lê `.acesso` (undefined se ausente). Valor cru do campo é
  // sempre string ou lista, nunca um objeto — então só objetos entram por aqui.
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return (input as { acesso?: unknown }).acesso
  }
  return input
}

// Normaliza o campo acesso (string legada, lista, ou objeto User) para lista de Acesso.
export function acessos(input?: unknown): Acesso[] {
  const raw = rawDe(input)
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : []
  return arr.map((a) => (a === 'user' ? 'consumidor' : a === 'produtor' ? 'fornecedor' : a)) as Acesso[]
}

export const isSuperadmin = (u?: unknown) => acessos(u).includes('superadmin')
export const isAdmin = (u?: unknown) => {
  const a = acessos(u)
  return a.includes('admin') || a.includes('superadmin')
}
export const isFornecedor = (u?: unknown) => acessos(u).includes('fornecedor')
export const isConsumidor = (u?: unknown) => acessos(u).includes('consumidor')

// Tipo de usuário: base de identidade mutuamente exclusiva (cliente/fornecedor) ou só admin.
// Admin é perfil independente, aplicado por cima do tipo.
export type Tipo = 'cliente' | 'fornecedor' | 'admin'

export function tipoDeAcesso(a: Acesso[]): Tipo {
  if (a.includes('consumidor')) return 'cliente'
  if (a.includes('fornecedor')) return 'fornecedor'
  return 'admin'
}

// Reconstrói a lista `acesso` a partir do tipo + flag admin, preservando 'superadmin' do registro.
export function montarAcesso(tipo: Tipo, adminOn: boolean, orig: Acesso[]): Acesso[] {
  const base: Acesso[] = tipo === 'cliente' ? ['consumidor'] : tipo === 'fornecedor' ? ['fornecedor'] : []
  const admin: Acesso[] = tipo === 'admin' || adminOn ? ['admin'] : []
  const sa: Acesso[] = orig.includes('superadmin') ? ['superadmin'] : []
  return [...sa, ...base, ...admin]
}
