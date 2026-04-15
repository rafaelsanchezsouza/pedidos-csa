import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Ban, CheckCircle, Upload } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usersApi, producersApi, colmeiasApi, rolesApi } from '@/services/api'
import type { BatchResult } from '@/services/api'
import type { User, Producer, ColmeiaRole } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
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
  acesso: User['acesso']
  role?: string
  isentoCotas?: boolean
  quota: User['quota']
}
const emptyMemberForm: MemberForm = {
  name: '', email: '', password: '', address: '', neighborhood: '', contact: '',
  frequency: 'semanal', deliveryType: 'colmeia', acesso: 'user', quota: 'Cota inteira',
}


interface ParsedRow {
  name: string
  email: string
  contact: string
  address: string
  neighborhood: string
  deliveryType: 'colmeia' | 'entrega'
  frequency: 'semanal' | 'quinzenal'
  quota: 'Cota inteira' | 'Meia cota'
  acesso: 'user'
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { field += c }
    } else {
      if (c === '"') { inQuotes = true }
      else if (c === ',') { fields.push(field); field = '' }
      else { field += c }
    }
  }
  fields.push(field)
  return fields
}

// Formato: exportação do Google Forms (Timestamp,Nome,e-mail,Whatsapp,Logradouro,Complemento,Bairro,CEP,Retirada,Frequência,...,Tamanho Cota)
function parseGoogleFormCsv(text: string): ParsedRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  return lines.slice(1).map(line => {
    const c = parseCsvLine(line)
    const addressParts = [c[4], c[5], c[6], c[7]].map(s => s?.trim()).filter(Boolean)
    const retirada = (c[8] ?? '').toLowerCase()
    const freq = (c[9] ?? '').toLowerCase()
    const cota = (c[12] ?? '').toLowerCase()
    return {
      name: c[1]?.trim() ?? '',
      email: c[2]?.trim().toLowerCase() ?? '',
      contact: (c[3]?.trim() ?? '').replace(/\D/g, ''),
      address: addressParts.join(', '),
      neighborhood: c[6]?.trim() ?? '',
      deliveryType: (retirada.includes('colmeia') ? 'colmeia' : 'entrega') as 'colmeia' | 'entrega',
      frequency: (freq.includes('quinzenal') ? 'quinzenal' : 'semanal') as 'semanal' | 'quinzenal',
      quota: (cota.includes('meia') ? 'Meia cota' : 'Cota inteira') as 'Cota inteira' | 'Meia cota',
      acesso: 'user' as const,
    }
  }).filter(r => r.name && r.email)
}

export function AdminPage() {
  const { colmeia, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<User[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [roles, setRoles] = useState<ColmeiaRole[]>([])
  const [newRoleName, setNewRoleName] = useState('')
  const [showNewRoleInput, setShowNewRoleInput] = useState(false)
  const [loading, setLoading] = useState(true)

  // Configurações de cota
  const [quotaInteira, setQuotaInteira] = useState(String(colmeia?.quotaInteira ?? 65))
  const [quotaMeia, setQuotaMeia] = useState(String(colmeia?.quotaMeia ?? 40))
  const [dueDay, setDueDay] = useState(String(colmeia?.dueDay ?? 10))
  const [savingQuota, setSavingQuota] = useState(false)
  const [quotaMessage, setQuotaMessage] = useState('')

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
  const [resetLink, setResetLink] = useState<string | null>(null)
  const [resettingPassword, setResettingPassword] = useState(false)

  // New member dialog
  const [memberDialog, setMemberDialog] = useState(false)
  const [memberForm, setMemberForm] = useState<MemberForm>(emptyMemberForm)
  const [savingMember, setSavingMember] = useState(false)
  const [memberError, setMemberError] = useState('')
  const [memberSuccess, setMemberSuccess] = useState<{ password: string; contact: string } | null>(null)

  // CSV import dialog
  const [csvDialog, setCsvDialog] = useState(false)
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResults, setCsvResults] = useState<BatchResult[] | null>(null)

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    try {
      const [us, prods, rols] = await Promise.all([
        usersApi.list(colmeia.id),
        producersApi.list(colmeia.id),
        rolesApi.list(colmeia.id),
      ])
      setUsers(us)
      setProducers(prods)
      setRoles(rols)
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
      acesso: u.acesso,
      role: u.role,
      isentoCotas: u.isentoCotas,
      quota: u.quota,
    })
    setResetLink(null)
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
    setMemberSuccess(null)
    setMemberDialog(true)
  }

  async function handleSaveMember() {
    if (!colmeia) return
    setSavingMember(true)
    setMemberError('')
    try {
      const result = await usersApi.createMember({ ...memberForm, colmeiaId: colmeia.id }, colmeia.id)
      await load()
      setMemberSuccess({ password: result.password ?? memberForm.password, contact: memberForm.contact })
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Erro ao criar membro')
    } finally {
      setSavingMember(false)
    }
  }

  // --- Import CSV ---
  function handleCsvFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setCsvRows(parseGoogleFormCsv(text))
      setCsvResults(null)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleCsvImport() {
    if (!colmeia || csvRows.length === 0) return
    setCsvImporting(true)
    try {
      const members = csvRows.map(r => ({ ...r, colmeiaId: colmeia.id }))
      const { results } = await usersApi.createMemberBatch(members, colmeia.id)
      setCsvResults(results)
      await load()
    } finally {
      setCsvImporting(false)
    }
  }

  function closeCsvDialog() {
    setCsvDialog(false)
    setCsvRows([])
    setCsvResults(null)
  }

  function setMember(field: keyof MemberForm, value: string) {
    setMemberForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSaveQuota() {
    if (!colmeia) return
    setSavingQuota(true)
    setQuotaMessage('')
    try {
      await colmeiasApi.update(colmeia.id, {
        quotaInteira: parseFloat(quotaInteira) || 0,
        quotaMeia: parseFloat(quotaMeia) || 0,
        dueDay: parseInt(dueDay) || 10,
      })
      await refreshUser()
      setQuotaMessage('Salvo!')
    } catch (err) {
      setQuotaMessage(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSavingQuota(false)
    }
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Administração</h1>

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="produtores">Produtores</TabsTrigger>
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <div className="flex justify-end gap-2 mb-4">
            <Button variant="outline" onClick={() => { setCsvRows([]); setCsvResults(null); setCsvDialog(true) }}>
              <Upload className="mr-2 h-4 w-4" /> Importar CSV
            </Button>
            <Button onClick={openCreateMember}>
              <Plus className="mr-2 h-4 w-4" /> Novo Membro
            </Button>
          </div>
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Frequência</TableHead>
                  <TableHead>Semana</TableHead>
                  <TableHead>Cota</TableHead>
                  <TableHead>Contato</TableHead>
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
                      <TableCell className="capitalize">{u.frequency}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.frequency === 'quinzenal'
                          ? u.quinzenalParity === 'impar' ? 'A' : u.quinzenalParity === 'par' ? 'B' : '—'
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm">{u.quota ?? '—'}</TableCell>
                      <TableCell className="text-sm">{u.contact}</TableCell>
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
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {users.filter((u) => !u.deleted).length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </CardContent>
              </Card>
            ) : (
              users.filter((u) => !u.deleted).map((u) => (
                <Card key={u.id} className={u.disabled ? 'opacity-50' : ''}>
                  <CardContent className="py-3 px-4 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {u.name}
                        {u.disabled && <span className="ml-2 text-xs text-destructive">(desabilitado)</span>}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {u.frequency}
                      {u.frequency === 'quinzenal' && (
                        <span className="ml-1">
                          · Semana {u.quinzenalParity === 'impar' ? 'A' : u.quinzenalParity === 'par' ? 'B' : '—'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{u.quota ?? '—'}</div>
                    <div className="text-sm text-muted-foreground">{u.contact}</div>
                    <div className="flex gap-1 pt-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditMember(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleToggleDisable(u)}>
                        {u.disabled ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Ban className="h-4 w-4 text-amber-500" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="produtores">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateProducer}>
              <Plus className="mr-2 h-4 w-4" /> Novo Produtor
            </Button>
          </div>
          {/* Desktop */}
          <div className="hidden md:block">
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
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {producers.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum produtor cadastrado.
                </CardContent>
              </Card>
            ) : (
              producers.map((p) => (
                <Card key={p.id}>
                  <CardContent className="py-3 px-4 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{p.name}</span>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => openEditProducer(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteProducer(p.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">{p.contact}</div>
                    {p.pixKey && <div className="text-sm text-muted-foreground">Pix: {p.pixKey}</div>}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
        <TabsContent value="configuracoes">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h2 className="font-semibold">Valores de Cota Semanal</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Cota inteira (R$/semana)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quotaInteira}
                    onChange={(e) => setQuotaInteira(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Meia cota (R$/semana)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quotaMeia}
                    onChange={(e) => setQuotaMeia(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Dia de vencimento</Label>
                  <Input
                    type="number"
                    min="1"
                    max="28"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleSaveQuota} disabled={savingQuota}>
                  {savingQuota ? 'Salvando...' : 'Salvar'}
                </Button>
                {quotaMessage && <span className="text-sm text-muted-foreground">{quotaMessage}</span>}
              </div>
            </CardContent>
          </Card>
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
      <Dialog open={memberDialog} onOpenChange={(open) => { if (!open) { setMemberDialog(false); setMemberSuccess(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Membro</DialogTitle>
          </DialogHeader>
          {memberSuccess ? (
            <>
              <div className="py-4 space-y-2 text-sm">
                <p className="font-medium text-green-700">Membro criado com sucesso!</p>
                <p>Senha temporária: <span className="font-mono font-bold">{memberSuccess.password}</span></p>
                {memberSuccess.contact
                  ? <p className="text-muted-foreground">WhatsApp enviado para {memberSuccess.contact}.</p>
                  : <p className="text-muted-foreground">Nenhum contato informado — WhatsApp não enviado.</p>}
              </div>
              <DialogFooter>
                <Button onClick={() => { setMemberDialog(false); setMemberSuccess(null) }}>Fechar</Button>
              </DialogFooter>
            </>
          ) : (
          <>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={memberForm.name} onChange={(e) => setMember('name', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Contato</Label>
                <Input value={memberForm.contact} onChange={(e) => setMember('contact', e.target.value)} placeholder="+55 11 99999-9999" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Endereço</Label>
                <Input value={memberForm.address} onChange={(e) => setMember('address', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={memberForm.neighborhood} onChange={(e) => setMember('neighborhood', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input type="email" value={memberForm.email} onChange={(e) => setMember('email', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Senha inicial <span className="text-muted-foreground font-normal">(gerada automaticamente se vazio)</span></Label>
                <Input type="password" value={memberForm.password} onChange={(e) => setMember('password', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nível de acesso</Label>
                <Select value={memberForm.acesso} onValueChange={(v) => setMember('acesso', v)}>
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
            <div className="space-y-1">
              <Label>Função na colmeia</Label>
              <Select
                value={memberForm.role ?? ''}
                onValueChange={(v) => {
                  if (v === '__criar__') { setShowNewRoleInput(true) }
                  else { setMemberForm((p) => ({ ...p, role: v })); setShowNewRoleInput(false) }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.name}>
                      <span className="flex items-center justify-between w-full gap-2">
                        {r.name}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!colmeia) return
                            await rolesApi.delete(r.id, colmeia.id)
                            await load()
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__criar__">Criar função...</SelectItem>
                </SelectContent>
              </Select>
              {showNewRoleInput && (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Nome da nova função"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      if (!newRoleName.trim() || !colmeia) return
                      const created = await rolesApi.create(newRoleName.trim(), colmeia.id)
                      await load()
                      setMemberForm((p) => ({ ...p, role: created.name }))
                      setNewRoleName('')
                      setShowNewRoleInput(false)
                    }}
                  >
                    Criar
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="memberIsentoCotas"
                checked={memberForm.isentoCotas ?? false}
                onChange={(e) => setMemberForm((p) => ({ ...p, isentoCotas: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label htmlFor="memberIsentoCotas" className="font-normal cursor-pointer">
                Isento de cota mensal
              </Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              disabled={savingMember || !memberForm.name || !memberForm.email}
            >
              {savingMember ? 'Criando...' : 'Criar membro'}
            </Button>
          </DialogFooter>
          </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: importar CSV */}
      <Dialog open={csvDialog} onOpenChange={(open) => { if (!open) closeCsvDialog() }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar membros via CSV</DialogTitle>
          </DialogHeader>

          {!csvResults && csvRows.length === 0 && (
            <div className="py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Exporte o Google Forms como CSV. Colunas esperadas: Timestamp, Nome, e-mail, Whatsapp, Logradouro, Complemento, Bairro, CEP, Retirada, Frequência, …, …, Tamanho Cota.
              </p>
              <input
                type="file"
                accept=".csv"
                className="block text-sm"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f) }}
              />
            </div>
          )}

          {!csvResults && csvRows.length > 0 && (
            <>
              <div className="py-2 max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="pb-1 pr-3">Nome</th>
                      <th className="pb-1 pr-3">E-mail</th>
                      <th className="pb-1 pr-3">Retirada</th>
                      <th className="pb-1">Frequência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 pr-3 font-medium">{r.name}</td>
                        <td className="py-1 pr-3 text-muted-foreground">{r.email}</td>
                        <td className="py-1 pr-3 capitalize">{r.deliveryType === 'colmeia' ? 'Colmeia' : 'Entrega'}</td>
                        <td className="py-1 capitalize">{r.frequency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCsvRows([])}>Voltar</Button>
                <Button onClick={handleCsvImport} disabled={csvImporting}>
                  {csvImporting ? 'Criando...' : `Criar ${csvRows.length} membro${csvRows.length > 1 ? 's' : ''}`}
                </Button>
              </DialogFooter>
            </>
          )}

          {csvResults && (
            <>
              <div className="py-2 max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="pb-1 pr-3">Nome</th>
                      <th className="pb-1 pr-3">E-mail</th>
                      <th className="pb-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvResults.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 pr-3 font-medium">{r.name}</td>
                        <td className="py-1 pr-3 text-muted-foreground">{r.email}</td>
                        <td className="py-1">
                          {r.success
                            ? <span className="text-green-700">✓ criado</span>
                            : <span className="text-destructive" title={r.error}>✗ erro</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button onClick={closeCsvDialog}>Fechar</Button>
              </DialogFooter>
            </>
          )}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nível de acesso</Label>
                <Select value={editForm.acesso} onValueChange={(v) => setEdit('acesso', v)}>
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
            <div className="space-y-1">
              <Label>Função na colmeia</Label>
              <Select
                value={editForm.role ?? ''}
                onValueChange={(v) => {
                  if (v === '__criar__') { setShowNewRoleInput(true) }
                  else { setEditForm((p) => ({ ...p, role: v })); setShowNewRoleInput(false) }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.name}>
                      <span className="flex items-center justify-between w-full gap-2">
                        {r.name}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!colmeia) return
                            await rolesApi.delete(r.id, colmeia.id)
                            await load()
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__criar__">Criar função...</SelectItem>
                </SelectContent>
              </Select>
              {showNewRoleInput && (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Nome da nova função"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      if (!newRoleName.trim() || !colmeia) return
                      const created = await rolesApi.create(newRoleName.trim(), colmeia.id)
                      await load()
                      setEditForm((p) => ({ ...p, role: created.name }))
                      setNewRoleName('')
                      setShowNewRoleInput(false)
                    }}
                  >
                    Criar
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="editIsentoCotas"
                checked={editForm.isentoCotas ?? false}
                onChange={(e) => setEditForm((p) => ({ ...p, isentoCotas: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label htmlFor="editIsentoCotas" className="font-normal cursor-pointer">
                Isento de cota mensal
              </Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="pt-2 border-t space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={resettingPassword}
              onClick={async () => {
                if (!editingUser || !colmeia) return
                setResettingPassword(true)
                setResetLink(null)
                try {
                  const { link, whatsappSent } = await usersApi.resetPassword(editingUser.id, colmeia.id)
                  setResetLink(whatsappSent ? `__whatsapp__${link}` : link)
                } catch {
                  setResetLink('Erro ao gerar link.')
                } finally {
                  setResettingPassword(false)
                }
              }}
            >
              {resettingPassword ? 'Gerando...' : 'Redefinir senha'}
            </Button>
            {resetLink && (
              <div className="space-y-1">
                {resetLink.startsWith('__whatsapp__') ? (
                  <p className="text-sm text-green-700">WhatsApp enviado para {editingUser?.contact}.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Input value={resetLink} readOnly className="text-xs" />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigator.clipboard.writeText(resetLink)}
                      >
                        Copiar
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Nenhum contato cadastrado. Compartilhe o link manualmente.</p>
                  </>
                )}
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
