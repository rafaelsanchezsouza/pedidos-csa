import { Router, Request, Response } from 'express'
import { listDocs, createDoc, getDoc, deleteDoc } from '../repositories/firestore.js'

const router = Router()

const DEFAULTS = ['colmeia', 'coagricultor']

interface RoleDoc {
  name: string
  colmeiaId: string
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string | undefined) || req.colmeiaId
    if (!colmeiaId) { res.status(400).json({ message: 'colmeiaId obrigatório' }); return }
    const roles = await listDocs<RoleDoc>('roles', [['colmeiaId', '==', colmeiaId]])
    const names = roles.map((r) => r.name)
    for (const name of DEFAULTS) {
      if (!names.includes(name)) {
        const created = await createDoc<RoleDoc>('roles', { name, colmeiaId })
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
    const colmeiaId = req.colmeiaId
    const { name } = req.body as { name?: string }
    if (!colmeiaId || !name?.trim()) { res.status(400).json({ message: 'name obrigatório' }); return }
    const existing = await listDocs<RoleDoc>('roles', [
      ['colmeiaId', '==', colmeiaId],
      ['name', '==', name.trim()],
    ])
    if (existing.length > 0) { res.status(409).json({ message: 'Função já existe' }); return }
    const created = await createDoc<RoleDoc>('roles', { name: name.trim(), colmeiaId })
    res.status(201).json(created)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const role = await getDoc<RoleDoc>('roles', req.params.id as string)
    if (!role) { res.status(404).json({ message: 'Não encontrado' }); return }
    if (DEFAULTS.includes(role.name)) {
      res.status(400).json({ message: 'Não é possível remover funções padrão' }); return
    }
    await deleteDoc('roles', req.params.id as string)
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
