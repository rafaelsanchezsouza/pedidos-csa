import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usersApi, producersApi } from '@/services/api'
import type { User, Producer } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ProducerForm { name: string; contact: string }
const emptyProducerForm: ProducerForm = { name: '', contact: '' }

export function AdminPage() {
  const { colmeia, refreshUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [loading, setLoading] = useState(true)

  const [producerDialog, setProducerDialog] = useState(false)
  const [editingProducer, setEditingProducer] = useState<Producer | null>(null)
  const [producerForm, setProducerForm] = useState<ProducerForm>(emptyProducerForm)
  const [savingProducer, setSavingProducer] = useState(false)

  const [userRoleDialog, setUserRoleDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<User['role']>('user')
  const [savingUser, setSavingUser] = useState(false)

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    try {
      const [us, prods] = await Promise.all([
        usersApi.list(colmeia.id),
        producersApi.list(colmeia.id),
      ])
      setUsers(us)
      setProducers(prods)
    } finally {
      setLoading(false)
    }
  }, [colmeia])

  useEffect(() => { load() }, [load])

  function openCreateProducer() {
    setEditingProducer(null)
    setProducerForm(emptyProducerForm)
    setProducerDialog(true)
  }

  function openEditProducer(p: Producer) {
    setEditingProducer(p)
    setProducerForm({ name: p.name, contact: p.contact })
    setProducerDialog(true)
  }

  async function handleSaveProducer() {
    if (!colmeia) return
    setSavingProducer(true)
    try {
      if (editingProducer) {
        await producersApi.update(editingProducer.id, producerForm, colmeia.id)
      } else {
        await producersApi.create({ ...producerForm, colmeiaId: colmeia.id }, colmeia.id)
      }
      setProducerDialog(false)
      await load()
    } finally {
      setSavingProducer(false)
    }
  }

  async function handleDeleteProducer(id: string) {
    if (!colmeia || !confirm('Excluir este produtor?')) return
    await producersApi.delete(id, colmeia.id)
    await load()
  }

  function openEditUserRole(u: User) {
    setEditingUser(u)
    setNewRole(u.role)
    setUserRoleDialog(true)
  }

  async function handleSaveUserRole() {
    if (!editingUser) return
    setSavingUser(true)
    try {
      await usersApi.updateMe({ role: newRole })
      setUserRoleDialog(false)
      await load()
      await refreshUser()
    } finally {
      setSavingUser(false)
    }
  }

  const roleLabel: Record<User['role'], string> = {
    user: 'Membro',
    admin: 'Admin',
    superadmin: 'Super Admin',
    produtor: 'Produtor',
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Administração</h1>

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="produtores">Produtores</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Frequência</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'admin' || u.role === 'superadmin' ? 'default' : 'secondary'}>
                        {roleLabel[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{u.frequency}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEditUserRole(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="produtores">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateProducer}>
              <Plus className="mr-2" /> Novo Produtor
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {producers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Nenhum produtor cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                producers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.contact}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditProducer(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteProducer(p.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <Dialog open={producerDialog} onOpenChange={setProducerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProducer ? 'Editar Produtor' : 'Novo Produtor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={producerForm.name}
                onChange={(e) => setProducerForm({ ...producerForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Contato (WhatsApp)</Label>
              <Input
                value={producerForm.contact}
                onChange={(e) => setProducerForm({ ...producerForm, contact: e.target.value })}
                placeholder="+55 11 99999-9999"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProducerDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveProducer} disabled={savingProducer || !producerForm.name}>
              {savingProducer ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={userRoleDialog} onOpenChange={setUserRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Função — {editingUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as User['role'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Membro</SelectItem>
                  <SelectItem value="produtor">Produtor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserRoleDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveUserRole} disabled={savingUser}>
              {savingUser ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
