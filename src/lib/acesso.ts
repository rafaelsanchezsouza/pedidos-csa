// Níveis de acesso (permissão do login). Um usuário pode ter VÁRIOS ao mesmo tempo.
// Rótulos antigos ('user'/'produtor') são normalizados na leitura, para compat com
// dados já gravados. Predicados abaixo são a fonte única de checagem de permissão.

export type Acesso = 'superadmin' | 'admin' | 'consumidor' | 'fornecedor'

export const ACESSO_LABEL: Record<Acesso, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  consumidor: 'Consumidor',
  fornecedor: 'Fornecedor',
}

// Normaliza o campo acesso (string legada ou lista) para lista de Acesso.
export function acessos(u?: { acesso?: unknown } | null): Acesso[] {
  const raw = u?.acesso
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : []
  return arr.map((a) => (a === 'user' ? 'consumidor' : a === 'produtor' ? 'fornecedor' : a)) as Acesso[]
}

export const isSuperadmin = (u?: { acesso?: unknown } | null) => acessos(u).includes('superadmin')
export const isAdmin = (u?: { acesso?: unknown } | null) => {
  const a = acessos(u)
  return a.includes('admin') || a.includes('superadmin')
}
export const isFornecedor = (u?: { acesso?: unknown } | null) => acessos(u).includes('fornecedor')
export const isConsumidor = (u?: { acesso?: unknown } | null) => acessos(u).includes('consumidor')

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
