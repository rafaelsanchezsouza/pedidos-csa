// Autorização do engine — a regra de QUEM pode fazer O QUÊ, num lugar só.
//
// Até 2026-08-21 as rotas confiavam no frontend: bastava estar autenticado para editar produto
// de qualquer tenant, listar todos os membros (nome, e-mail, telefone, endereço) ou marcar a
// própria fatura como paga. O gate existia só nas telas. Isto fecha no servidor.
//
// Os predicados recebem o `Ator` (quem está chamando) e o tenant do RECURSO — nunca o tenant
// que veio no header, que é justamente o que o atacante controla.
import type { Response } from 'express'
import type { Repo } from './repo.js'
import type { UserDoc } from '../types.js'
import { isAdmin, isSuperadmin, isFornecedor } from '../acesso.js'

export interface Ator {
  uid: string
  acesso?: unknown
  tenantId?: string
  producerId?: string
  role?: string
}

export async function carregarAtor(repo: Repo, uid: string): Promise<Ator> {
  const doc = await repo.getDoc<UserDoc>('users', uid)
  return {
    uid,
    acesso: doc?.acesso,
    tenantId: doc?.tenantId,
    producerId: doc?.producerId,
    role: doc?.role,
  }
}

/** `role: 'superadmin'` é rótulo legado da CSA, ainda aceito na leitura (como em tenants.ts). */
export const ehSuperadmin = (a: Ator): boolean => isSuperadmin(a.acesso) || a.role === 'superadmin'

/** Superadmin atravessa tenants; admin manda só no próprio. */
export const ehAdmin = (a: Ator, tenantId?: string): boolean =>
  ehSuperadmin(a) || (isAdmin(a.acesso) && !!tenantId && a.tenantId === tenantId)

export const ehFornecedor = (a: Ator, tenantId?: string): boolean =>
  isFornecedor(a.acesso) && !!tenantId && a.tenantId === tenantId

/** Catálogo e oferta: admin, ou fornecedor do próprio tenant (o escopo por produtor vem abaixo). */
export const ehAdminOuFornecedor = (a: Ator, tenantId?: string): boolean =>
  ehAdmin(a, tenantId) || ehFornecedor(a, tenantId)

/**
 * Fornecedor mexe só no que é do SEU produtor (`User.producerId`); admin passa por cima.
 * `producerId` ausente no recurso = só admin (não dá para provar que é dele).
 */
export const podeMexerNoProducer = (a: Ator, tenantId?: string, producerId?: string): boolean =>
  ehAdmin(a, tenantId) || (ehFornecedor(a, tenantId) && !!producerId && a.producerId === producerId)

export function negar(res: Response, motivo = 'Sem permissão para esta operação'): void {
  res.status(403).json({ message: motivo })
}

/** Campos que o próprio usuário pode alterar em `PUT /users/me`. Fora daqui, só admin —
 *  sem esta lista, um membro se promovia a admin mandando `acesso` no corpo. */
export const CAMPOS_DO_PROPRIO_PERFIL = [
  'name',
  'address',
  'neighborhood',
  'contact',
  'frequency',
  'deliveryType',
  'mustChangePassword',
] as const

export function filtrarCamposDoPerfil(body: unknown): Record<string, unknown> {
  const entrada = (body ?? {}) as Record<string, unknown>
  const saida: Record<string, unknown> = {}
  for (const campo of CAMPOS_DO_PROPRIO_PERFIL) {
    if (entrada[campo] !== undefined) saida[campo] = entrada[campo]
  }
  return saida
}
