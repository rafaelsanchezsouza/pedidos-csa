import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Ban, CheckCircle } from 'lucide-react'
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

interface ProducerForm { name: string; contact: string; pixKey: string }
const emptyProducerForm: ProducerForm = { name: '', contact: '', pixKey: '' }

interface MemberForm {
  name: string
  email: string
  password: string
  address: string
  neighborhood: string
  contact: string
  frequency: User['frequency']
  deliveryType: User['deliveryType']
  role: User['role']
  quota: User['quota']
}
const emptyMemberForm: MemberForm = {
  name: '', email: '', password: '', address: '', neighborhood: '', contact: '',
  frequency: 'semanal', deliveryType: 'colmeia', role: 'user', quota: 'Cota inteira',
}

const roleLabel: Record<User['role'], string> = {
  user: 'Membro', admin: 'Admin', superadmin: 'Super Admin', produtor: 'Produtor',
}

export function AdminPage() {
  const { colmeia, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<User[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [loading, setLoading] = useState(true)

  // Producer dialog
  const [producerDialog, setProducerDialog] = useState(false)
  const [editingProducer, setEditingProducer] = useState<Producer | null>(null)
  const [producerForm, setProducerForm] = useState<ProducerForm>(emptyProducerForm)
  const [savingProducer, setSavingProducer] = useState(false)

  // Edit member dialog
  const [editDialog, setEditDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<Partial<User>>({})
  const [savingEdit, setSavingEdit] = useState(false)

  // New member dialog
  const [memberDialog, setMemberDialog] = useState(false)
  const [memberForm, setMemberForm] = useState<MemberForm>(emptyMemberForm)
  const [savingMember, setSavingMember] = useState(false)
  const [memberError, setMemberError] = useState('')

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

  // --- Produtores ---
  function openCreateProducer() {
    setEditingProducer(null)
    setProducerForm(emptyProducerForm)
    setProducerDialog(true)
  }

  function openEditProducer(p: Producer) {
    setEditingProducer(p)
    setProducerForm({ name: p.name, contact: p.contact, pixKey: p.pixKey ?? '' })
    setProducerDialog(true)
  }

  async function handleSaveProducer() {
    if (!colmeia) return
    setSavingProducer(true)
    try {
      if (editingProducer) {
        await producersApi.update(editingProducer.id, producerForm, colmeia.id)
        setProducerDialog(false)
        await load()
      } else {
        const created = await producersApi.create({ ...producerForm, colmeiaId: colmeia.id }, colmeia.id)
        setProducerDialog(false)
        await load()
        // Fluxo: após criar produtor, ir direto para adicionar oferta
        navigate(`/ofertas?producerId=${created.id}`)
      }
    } finally {
      setSavingProducer(false)
    }
  }

  async function handleDeleteProducer(id: string) {
    if (!colmeia || !confirm('Excluir este produtor?')) return
    await producersApi.delete(id, colmeia.id)
    await load()
  }

  // --- Editar membro ---
  function openEditMember(u: User) {
    setEditingUser(u)
    setEditForm({
      name: u.name,
      address: u.address,
      neighborhood: u.neighborhood,
      contact: u.contact,
      frequency: u.frequency,
      quinzenalParity: u.quinzenalParity,
      deliveryType: u.deliveryType,
      role: u.role,
      quota: u.quota,
    })
    setEditDialog(true)
  }

  async function handleSaveEdit() {
    if (!editingUser || !colmeia) return
    setSavingEdit(true)
    try {
      await usersApi.update(editingUser.id, editForm, colmeia.id)
      setEditDialog(false)
      await load()
      await refreshUser()
    } finally {
      setSavingEdit(false)
    }
  }

  function setEdit(field: keyof User, value: string) {
    setEditForm((prev) => ({ ...prev, [field]: value }))
  }

  // --- Disable / Delete usuário ---
  async function handleToggleDisable(u: User) {
    if (!colmeia) return
    if (u.disabled) {
      await usersApi.enable(u.id, colmeia.id)
    } else {
      await usersApi.disable(u.id, colmeia.id)
    }
    await load()
  }

  async function handleDeleteUser(u: User) {
    if (!colmeia || !confirm(`Excluir permanentemente "${u.name}"? O histórico de pedidos será preservado.`)) return
    await usersApi.delete(u.id, colmeia.id)
    await load()
  }

  // --- Novo membro ---
  function openCreateMember() {
    setMemberForm(emptyMemberForm)
    setMemberError('')
    setMemberDialog(true)
  }

  async function handleSaveMember() {
    if (!colmeia) return
    setSavingMember(true)
    setMemberError('')
    try {
      await usersApi.createMember({ ...memberForm, colmeiaId: colmeia.id }, colmeia.id)
      setMemberDialog(false)
      await load()
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Erro ao criar membro')
    } finally {
      setSavingMember(false)
    }
  }

  function setMember(field: keyof MemberForm, value: string) {
    setMemberForm((prev) => ({ ...prev, [field]: value }))
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
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateMember}>
              <Plus className="mr-2 h-4 w-4" /> Novo Membro
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Frequência</TableHead>
                <TableHead>Semana</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.filter((u) => !u.deleted).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                users.filter((u) => !u.deleted).map((u) => (
                  <TableRow key={u.id} className={u.disabled ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">
                      {u.name}
                      {u.disabled && <span className="ml-2 text-xs text-destructive">(desabilitado)</span>}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'admin' || u.role === 'superadmin' ? 'default' : 'secondary'}>
                        {roleLabel[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{u.frequency}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.frequency === 'quinzenal'
                        ? u.quinzenalParity === 'impar' ? 'A' : u.quinzenalParity === 'par' ? 'B' : '—'
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditMember(u)} title="Editar membro">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleToggleDisable(u)} title={u.disabled ? 'Habilitar' : 'Desabilitar'}>
                          {u.disabled ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Ban className="h-4 w-4 text-amber-500" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u)} title="Excluir">
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

        <TabsContent value="produtores">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateProducer}>
              <Plus className="mr-2 h-4 w-4" /> Novo Produtor
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Chave Pix</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {producers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhum produtor cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                producers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.contact}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.pixKey || '—'}</TableCell>
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

      {/* Dialog: produtor */}
      <Dialog open={producerDialog} onOpenChange={setProducerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProducer ? 'Editar Produtor' : 'Novo Produtor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={producerForm.name} onChange={(e) => setProducerForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Contato</Label>
              <Input value={producerForm.contact} onChange={(e) => setProducerForm((f) => ({ ...f, contact: e.target.value }))} placeholder="+55 11 99999-9999" />
            </div>
            <div className="space-y-1">
              <Label>Chave Pix</Label>
              <Input value={producerForm.pixKey} onChange={(e) => setProducerForm((f) => ({ ...f, pixKey: e.target.value }))} placeholder="CPF, e-mail, telefone ou chave aleatória" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProducerDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveProducer} disabled={savingProducer || !producerForm.name}>
              {savingProducer ? 'Salvando...' : editingProducer ? 'Salvar' : 'Criar e adicionar oferta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: novo membro */}
      <Dialog open={memberDialog} onOpenChange={setMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={memberForm.name} onChange={(e) => setMember('name', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Contato</Label>
                <Input value={memberForm.contact} onChange={(e) => setMember('contact', e.target.value)} placeholder="+55 11 99999-9999" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Endereço</Label>
                <Input value={memberForm.address} onChange={(e) => setMember('address', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={memberForm.neighborhood} onChange={(e) => setMember('neighborhood', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input type="email" value={memberForm.email} onChange={(e) => setMember('email', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Senha inicial</Label>
                <Input type="password" value={memberForm.password} onChange={(e) => setMember('password', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Função</Label>
                <Select value={memberForm.role} onValueChange={(v) => setMember('role', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Membro</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="produtor">Produtor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Cota</Label>
                <Select value={memberForm.quota ?? 'Cota inteira'} onValueChange={(v) => setMember('quota', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cota inteira">Cota inteira</SelectItem>
                    <SelectItem value="Meia cota">Meia cota</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Frequência</Label>
                <Select value={memberForm.frequency} onValueChange={(v) => setMember('frequency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quinzenal">Quinzenal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Retirada</Label>
                <Select value={memberForm.deliveryType} onValueChange={(v) => setMember('deliveryType', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="colmeia">Na colmeia</SelectItem>
                    <SelectItem value="entrega">Entrega</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {memberError && <p className="text-sm text-destructive">{memberError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveMember}
              disabled={savingMember || !memberForm.name || !memberForm.email || !memberForm.password}
            >
              {savingMember ? 'Criando...' : 'Criar membro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: editar membro */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar — {editingUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={editForm.name ?? ''} onChange={(e) => setEdit('name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Endereço</Label>
              <Input value={editForm.address ?? ''} onChange={(e) => setEdit('address', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Bairro</Label>
              <Input value={editForm.neighborhood ?? ''} onChange={(e) => setEdit('neighborhood', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Contato</Label>
              <Input value={editForm.contact ?? ''} onChange={(e) => setEdit('contact', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Função</Label>
                <Select value={editForm.role} onValueChange={(v) => setEdit('role', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Membro</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="produtor">Produtor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Cota</Label>
                <Select value={editForm.quota ?? 'Cota inteira'} onValueChange={(v) => setEdit('quota', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cota inteira">Cota inteira</SelectItem>
                    <SelectItem value="Meia cota">Meia cota</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Frequência</Label>
                <Select value={editForm.frequency} onValueChange={(v) => setEdit('frequency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quinzenal">Quinzenal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Retirada</Label>
                <Select value={editForm.deliveryType} onValueChange={(v) => setEdit('deliveryType', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="colmeia">Na colmeia</SelectItem>
                    <SelectItem value="entrega">Entrega</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editForm.frequency === 'quinzenal' && (
              <div className="space-y-1">
                <Label>Ciclo quinzenal</Label>
                <Select value={editForm.quinzenalParity ?? ''} onValueChange={(v) => setEdit('quinzenalParity', v)}>
                  <SelectTrigger><SelectValue placeholder="Não definido" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="impar">Semana A</SelectItem>
                    <SelectItem value="par">Semana B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
