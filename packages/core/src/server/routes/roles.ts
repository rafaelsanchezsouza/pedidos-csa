import { Router, type Request, type Response } from 'express'
import type { AppConfig } from '../../config.js'
import type { EngineDeps } from '../repo.js'
import type { RoleDoc } from '../../types.js'
import '../types.js'

// Funções no coletivo (campo livre do membro). Os defaults são vocabulário do cliente
// (CSA: colmeia/coagricultor; padaria: nenhum) — vêm de config.tenantDefaults.roleDefaults.
export type { RoleDoc }

export function createRolesRouter({ repo }: EngineDeps, config: AppConfig): Router {
  const router = Router()
  const defaults = config.tenantDefaults.roleDefaults

  router.get('/', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string | undefined) || req.tenantId
      if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
      const roles = await repo.listDocs<RoleDoc>('roles', [['tenantId', '==', tenantId]])
      const names = roles.map((r) => r.name)
      for (const name of defaults) {
        if (!names.includes(name)) {
          const created = await repo.createDoc<RoleDoc>('roles', { name, tenantId })
          roles.unshift(created)
        }
      }
      res.json(roles)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.post('/', async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId
      const { name } = req.body as { name?: string }
      if (!tenantId || !name?.trim()) { res.status(400).json({ message: 'name obrigatório' }); return }
      const existing = await repo.listDocs<RoleDoc>('roles', [
        ['tenantId', '==', tenantId],
        ['name', '==', name.trim()],
      ])
      if (existing.length > 0) { res.status(409).json({ message: 'Função já existe' }); return }
      const created = await repo.createDoc<RoleDoc>('roles', { name: name.trim(), tenantId })
      res.status(201).json(created)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const role = await repo.getDoc<RoleDoc>('roles', req.params.id as string)
      if (!role) { res.status(404).json({ message: 'Não encontrado' }); return }
      if (defaults.includes(role.name)) {
        res.status(400).json({ message: 'Não é possível remover funções padrão' }); return
      }
      await repo.deleteDoc('roles', req.params.id as string)
      res.status(204).send()
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
