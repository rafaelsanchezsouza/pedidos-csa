import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Ban, CheckCircle, Upload } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usersApi, producersApi, tenantsApi, rolesApi } from '@/services/api'
import type { BatchResult } from '@/services/api'
import type { User, Producer, TenantRole, QuotaTier } from '@/types'
import { isAdmin, isConsumidor, isSuperadmin, acessos, tipoDeAcesso, montarAcesso, type Acesso, type Tipo } from '@/lib/acesso'
import { MULTI_TENANT } from '@/lib/features'
import { parseCsvLine } from '@/lib/csv'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
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
  producerId?: string
  role?: string
  isentoCotas?: boolean
  quota?: string
}
const emptyMemberForm: MemberForm = {
  name: '', email: '', password: '', address: '', neighborhood: '', contact: '',
  frequency: 'semanal', deliveryType: 'retirada', acesso: ['consumidor'],
}

interface ParsedRow {
  name: string
  email: string
  contact: string
  address: string
  neighborhood: string
  deliveryType: 'retirada' | 'entrega'
  frequency: 'semanal' | 'quinzenal'
  quota?: string
  acesso: Acesso[]
}

// Seletor de tipo (radio) + checkbox admin. Reutilizado nos modais de criar/editar usuário.
function TipoSelector({ name, acesso, onChange }: { name: string; acesso: Acesso[]; onChange: (a: Acesso[]) => void }) {
  const tipo = tipoDeAcesso(acesso)
  const adminOn = acesso.includes('admin')
  const opcoes: [Tipo, string][] = [['cliente', 'Cliente'], ['fornecedor', 'Fornecedor'], ['admin', 'Somente administrador']]
  return (
    <div className="space-y-2">
      <Label>Tipo de usuário</Label>
      <div className="flex flex-wrap gap-3">
        {opcoes.map(([t, lbl]) => (
          <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              name={name}
              checked={tipo === t}
              onChange={() => onChange(montarAcesso(t, adminOn, acesso))}
            />
            {lbl}
          </label>
        ))}
      </div>
      {tipo !== 'admin' && (
        <label className="flex items-center gap-1.5 text-sm cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={adminOn}
            onChange={(e) => onChange(montarAcesso(tipo, e.target.checked, acesso))}
          />
          Também é administrador
        </label>
      )}
    </div>
  )
}

function acolhidaBadge(expiry: string) {
  const today = new Date().toISOString().split('T')[0]
  const active = expiry >= today
  const [, m, d] = expiry.split('-')
  return { active, label: active ? `Acolhida até ${d}/${m}` : 'Acolhida encerrada' }
}

// Formato: exportação do Google Forms (Timestamp,Nome,e-mail,Whatsapp,Logradouro,Complemento,Bairro,CEP,Retirada,Frequência,...,Tamanho Cota)
function parseGoogleFormCsv(text: string, tiers: QuotaTier[]): ParsedRow[] {
  // "meia" → 2º tier (se houver); senão o 1º. Mapeia o texto legado do form aos tiers do tenant.
  const tierInteira = tiers[0]?.name
  const tierMeia = tiers[1]?.name ?? tiers[0]?.name
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
      deliveryType: (retirada.includes('entrega') ? 'entrega' : 'retirada') as 'retirada' | 'entrega',
      frequency: (freq.includes('quinzenal') ? 'quinzenal' : 'semanal') as 'semanal' | 'quinzenal',
      quota: cota.includes('meia') ? tierMeia : tierInteira,
      acesso: ['consumidor'] as Acesso[],
    }
  }).filter(r => r.name && r.email)
}

export function AdminPage() {
  const { tenant, tenants, user, refreshUser } = useAuth()
  const [tab, setTab] = useState('usuarios')
  const navigate = useNavigate()
  const [users, setUsers] = useState<User[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [roles, setRoles] = useState<TenantRole[]>([])
  const [newRoleName, setNewRoleName] = useState('')
  const [showNewRoleInput, setShowNewRoleInput] = useState(false)
  const [loading, setLoading] = useState(true)

  // Tiers de cota efetivos do tenant (deriva do legado quando `quotas` ausente).
  const quotaTiers: QuotaTier[] = tenant?.quotas?.length
    ? tenant.quotas
    : [{ name: 'Cota inteira', price: tenant?.quotaInteira ?? 65 }, { name: 'Meia cota', price: tenant?.quotaMeia ?? 40 }]
  const quotaTerm = tenant?.quotaTerm || 'Cota'

  // Configurações de cota e agendamento. Linha de tier carrega `originalName` p/ cascata ao renomear.
  const [quotaTermInput, setQuotaTermInput] = useState(quotaTerm)
  const [tierRows, setTierRows] = useState<Array<{ id: string; name: string; price: string; originalName?: string }>>(
    () => quotaTiers.map((q, i) => ({ id: `${i}-${q.name}`, name: q.name, price: String(q.price), originalName: q.name }))
  )
  const [freteDelivery, setFreteDelivery] = useState(String(tenant?.freteDelivery ?? 0))
  const [dueDay, setDueDay] = useState(String(tenant?.dueDay ?? 10))
  const [orderSendDay, setOrderSendDay] = useState(String(tenant?.orderSendDay ?? 2))
  const [orderSendHour, setOrderSendHour] = useState(String(tenant?.orderSendHour ?? 6))
  const [weekChangeDay, setWeekChangeDay] = useState(String(tenant?.weekChangeDay ?? 0))
  const [savingQuota, setSavingQuota] = useState(false)
  const [quotaMessage, setQuotaMessage] = useState('')

  // Organização dialog
  const [tenantDialog, setTenantDialog] = useState(false)
  const [newTenantName, setNewTenantName] = useState('')
  const [savingTenant, setSavingTenant] = useState(false)
  const [tenantError, setTenantError] = useState('')

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
  const [inAcolhida, setInAcolhida] = useState(true)
  // Foco inicial explícito dos modais (senão o Radix pode não pousar num campo do modal).
  const memberFirstFieldRef = useRef<HTMLInputElement>(null)
  const editFirstFieldRef = useRef<HTMLInputElement>(null)

  // Filtros de usuários
  const [filterName, setFilterName] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // CSV import dialog
  const [csvDialog, setCsvDialog] = useState(false)
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResults, setCsvResults] = useState<BatchResult[] | null>(null)

  const load = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    try {
      const [us, prods, rols] = await Promise.all([
        usersApi.list(tenant.id),
        producersApi.list(tenant.id),
        rolesApi.list(tenant.id),
      ])
      setUsers(us)
      setProducers(prods)
      setRoles(rols)
    } finally {
      setLoading(false)
    }
  }, [tenant])

  useEffect(() => { load() }, [load])

  // Ressincroniza o editor de cotas quando o tenant carrega/muda (evita estado inicial defasado).
  useEffect(() => {
    setQuotaTermInput(tenant?.quotaTerm || 'Cota')
    setTierRows(quotaTiers.map((q, i) => ({ id: `${i}-${q.name}`, name: q.name, price: String(q.price), originalName: q.name })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  // --- Organizações ---
  async function handleCreateTenant() {
    if (!newTenantName.trim()) return
    setSavingTenant(true)
    setTenantError('')
    try {
      await tenantsApi.create({ name: newTenantName.trim() })
      await refreshUser()
      setTenantDialog(false)
      setNewTenantName('')
    } catch (err) {
      setTenantError(String(err))
    } finally {
      setSavingTenant(false)
    }
  }

  // --- Fornecedores ---
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
    if (!tenant) return
    setSavingProducer(true)
    try {
      if (editingProducer) {
        await producersApi.update(editingProducer.id, producerForm, tenant.id)
        setProducerDialog(false)
        await load()
      } else {
        const created = await producersApi.create({ ...producerForm, tenantId: tenant.id }, tenant.id)
        setProducerDialog(false)
        await load()
        // Fluxo: após criar fornecedor, ir direto para adicionar oferta
        navigate(`/ofertas?producerId=${created.id}`)
      }
    } finally {
      setSavingProducer(false)
    }
  }

  async function handleDeleteProducer(id: string) {
    if (!tenant || !confirm('Excluir este produtor?')) return
    await producersApi.delete(id, tenant.id)
    await load()
  }

  // --- Editar cliente ---
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
      acesso: acessos(u),
      role: u.role,
      isentoCotas: u.isentoCotas,
      quota: u.quota,
      acolhidaExpiry: u.acolhidaExpiry,
      freteDelivery: u.freteDelivery,
    })
    setResetLink(null)
    setEditDialog(true)
  }

  async function handleSaveEdit() {
    if (!editingUser || !tenant) return
    setSavingEdit(true)
    try {
      const acesso = acessos(editForm)
      const producerId = resolveProducerId(acesso, editForm.producerId)
      let updates: Record<string, unknown>
      if (tipoDeAcesso(acesso) === 'cliente') {
        updates = { ...editForm, producerId }
      } else {
        // Converteu p/ fornecedor/admin: zera campos de consumo (senão a fatura de cota/frete
        // continuaria sendo gerada por resíduo). null limpa o campo no Firestore.
        const { address: _a, neighborhood: _n, frequency: _f, deliveryType: _d, quinzenalParity: _q,
          quota: _c, isentoCotas: _i, acolhidaExpiry: _e, freteDelivery: _fr, ...rest } = editForm
        updates = {
          ...rest, producerId,
          address: null, neighborhood: null, frequency: null, deliveryType: null, quinzenalParity: null,
          quota: null, isentoCotas: null, acolhidaExpiry: null, freteDelivery: null,
        }
      }
      await usersApi.update(editingUser.id, updates as Partial<User>, tenant.id)
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
    if (!tenant) return
    if (u.disabled) {
      await usersApi.enable(u.id, tenant.id)
    } else {
      await usersApi.disable(u.id, tenant.id)
    }
    await load()
  }

  async function handleDeleteUser(u: User) {
    if (!tenant || !confirm(`Excluir permanentemente "${u.name}"? O histórico de pedidos será preservado.`)) return
    await usersApi.delete(u.id, tenant.id)
    await load()
  }

  // --- Novo usuário ---
  function openCreateMember(tipo: Tipo = 'cliente') {
    setMemberForm({ ...emptyMemberForm, acesso: montarAcesso(tipo, false, []), quota: quotaTiers[0]?.name })
    setMemberError('')
    setMemberSuccess(null)
    setInAcolhida(true)
    setMemberDialog(true)
  }

  async function handleSaveMember() {
    if (!tenant) return
    setSavingMember(true)
    setMemberError('')
    try {
      const isCliente = tipoDeAcesso(memberForm.acesso) === 'cliente'
      const acolhidaExpiry = isCliente && inAcolhida
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : undefined
      // Fornecedor/admin não carregam campos de consumo — enviar só o que faz sentido para o tipo.
      const { address, neighborhood, frequency, deliveryType, quota, isentoCotas, ...common } = memberForm
      const consumo = isCliente
        ? { address, neighborhood, frequency, deliveryType, quota, isentoCotas, ...(acolhidaExpiry ? { acolhidaExpiry } : {}) }
        : {}
      const result = await usersApi.createMember(
        { ...common, ...consumo, producerId: resolveProducerId(memberForm.acesso, memberForm.producerId), tenantId: tenant.id } as Omit<User, 'id'> & { password?: string },
        tenant.id
      )
      await load()
      setMemberSuccess({ password: result.password ?? memberForm.password, contact: memberForm.contact })
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Erro ao criar usuário')
    } finally {
      setSavingMember(false)
    }
  }

  // --- Import CSV ---
  function handleCsvFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setCsvRows(parseGoogleFormCsv(text, quotaTiers))
      setCsvResults(null)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleCsvImport() {
    if (!tenant || csvRows.length === 0) return
    setCsvImporting(true)
    try {
      const members = csvRows.map(r => ({ ...r, tenantId: tenant.id }))
      const { results } = await usersApi.createMemberBatch(members, tenant.id)
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

  // Resolve o vínculo fornecedor↔entidade: fornecedor com 1 fornecedor no catálogo → auto;
  // não-fornecedor → limpa (undefined). Salvo em User.producerId.
  function resolveProducerId(acesso: Acesso[], atual?: string): string | undefined {
    if (!acesso.includes('fornecedor')) return undefined
    return atual || (producers.length === 1 ? producers[0].id : undefined)
  }

  // --- Editor de cotas ---
  function quantosUsam(name?: string): number {
    return name ? users.filter((u) => !u.deleted && u.quota === name).length : 0
  }
  function addTier() {
    setTierRows((prev) => [...prev, { id: `new-${Date.now()}`, name: '', price: '0' }])
  }
  function updateTier(id: string, field: 'name' | 'price', value: string) {
    setTierRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }
  function removeTier(row: { id: string; originalName?: string }) {
    const emUso = quantosUsam(row.originalName)
    if (emUso > 0) {
      alert(`Não é possível remover: ${emUso} usuário(s) ainda usam essa cota. Reatribua-os primeiro.`)
      return
    }
    setTierRows((prev) => prev.filter((r) => r.id !== row.id))
  }

  async function handleSaveQuota() {
    if (!tenant) return
    setSavingQuota(true)
    setQuotaMessage('')
    try {
      const quotas: QuotaTier[] = tierRows
        .map((r) => ({ name: r.name.trim(), price: parseFloat(r.price) || 0 }))
        .filter((q) => q.name)
      // Cascata: para cada tier renomeado, migra os usuários do nome antigo para o novo.
      for (const r of tierRows) {
        const novo = r.name.trim()
        if (r.originalName && novo && r.originalName !== novo) {
          await usersApi.renameQuota(r.originalName, novo, tenant.id)
        }
      }
      await tenantsApi.update(tenant.id, {
        quotas,
        quotaTerm: quotaTermInput.trim() || 'Cota',
        freteDelivery: parseFloat(freteDelivery) || 0,
        dueDay: parseInt(dueDay) || 10,
        orderSendDay: parseInt(orderSendDay),
        orderSendHour: parseInt(orderSendHour),
        weekChangeDay: parseInt(weekChangeDay),
      })
      await refreshUser()
      await load()
      // Reancora originalName nos nomes salvos (renome seguinte não recascateia o já aplicado).
      setTierRows(quotas.map((q, i) => ({ id: `${i}-${q.name}`, name: q.name, price: String(q.price), originalName: q.name })))
      setQuotaMessage('Salvo!')
    } catch (err) {
      setQuotaMessage(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSavingQuota(false)
    }
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>

  const baseUsers = users
    .filter((u) => !u.deleted)
    .filter((u) => showInactive || !u.disabled)
    .filter((u) => !filterName.trim() || u.name.toLowerCase().includes(filterName.toLowerCase()))
  // Clientes = consumidores (admin/superadmin nunca entram); Admins = admin/superadmin.
  const clientes = baseUsers.filter((u) => isConsumidor(u) && !isAdmin(u))
  const admins = baseUsers.filter((u) => isAdmin(u))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) // admin sempre em ordem alfabética (#46)

  // Só clientes têm campos de consumo (endereço, cota, frequência, retirada...).
  const memberIsCliente = tipoDeAcesso(memberForm.acesso) === 'cliente'
  const editIsCliente = tipoDeAcesso(acessos(editForm)) === 'cliente'

  // Tabela de usuários (desktop + mobile), reusada nas abas Clientes e Admins.
  function renderUserTable(list: User[]) {
    return (
      <>
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Frequência</TableHead>
                <TableHead>Semana</TableHead>
                <TableHead>{quotaTerm}</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                list.map((u) => (
                  <TableRow key={u.id} className={u.disabled ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">
                      {u.name}
                      {u.disabled && <span className="ml-2 text-xs text-destructive">(desabilitado)</span>}
                      {u.acolhidaExpiry && (
                        <span className={`ml-2 text-xs ${acolhidaBadge(u.acolhidaExpiry).active ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          ({acolhidaBadge(u.acolhidaExpiry).label})
                        </span>
                      )}
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
                        <Button variant="ghost" size="icon" onClick={() => openEditMember(u)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleToggleDisable(u)} title={u.disabled ? 'Habilitar' : 'Desabilitar'}>
                          {u.disabled ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Ban className="h-4 w-4 text-amber-500" />}
                        </Button>
                        {isSuperadmin(user) && (
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u)} title="Excluir">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-3">
          {list.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum usuário encontrado.
              </CardContent>
            </Card>
          ) : (
            list.map((u) => (
              <Card key={u.id} className={u.disabled ? 'opacity-50' : ''}>
                <CardContent className="py-3 px-4 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {u.name}
                      {u.disabled && <span className="ml-2 text-xs text-destructive">(desabilitado)</span>}
                      {u.acolhidaExpiry && (
                        <span className={`ml-2 text-xs ${acolhidaBadge(u.acolhidaExpiry).active ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          ({acolhidaBadge(u.acolhidaExpiry).label})
                        </span>
                      )}
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
                    {isSuperadmin(user) && (
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </>
    )
  }

  // Ação principal de cada aba.
  const acaoPrincipalDaAba =
    tab === 'usuarios' ? (
      <Button onClick={() => openCreateMember('cliente')}>
        <Plus className="mr-2 h-4 w-4" /> Novo Cliente
      </Button>
    ) : tab === 'admins' ? (
      <Button onClick={() => openCreateMember('admin')}>
        <Plus className="mr-2 h-4 w-4" /> Novo Usuário
      </Button>
    ) : tab === 'produtores' ? (
      <Button onClick={openCreateProducer}>
        <Plus className="mr-2 h-4 w-4" /> Novo Fornecedor
      </Button>
    ) : tab === 'tenants' ? (
      <Button onClick={() => { setNewTenantName(''); setTenantError(''); setTenantDialog(true) }}>
        <Plus className="mr-2 h-4 w-4" /> Nova Organização
      </Button>
    ) : null

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Administração"
        secondaryAction={tab === 'usuarios' && (
          <Button variant="outline" onClick={() => { setCsvRows([]); setCsvResults(null); setCsvDialog(true) }}>
            <Upload className="mr-2 h-4 w-4" /> Importar CSV
          </Button>
        )}
        primaryAction={acaoPrincipalDaAba}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="usuarios">Clientes</TabsTrigger>
          <TabsTrigger value="admins">Admins</TabsTrigger>
          <TabsTrigger value="produtores">Fornecedores</TabsTrigger>
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
          {MULTI_TENANT && isSuperadmin(user) && (
            <TabsTrigger value="tenants">Organizações</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="usuarios">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Input
              placeholder="Buscar por nome..."
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              className="flex-1 min-w-[160px]"
            />
            <Button
              variant={showInactive ? 'default' : 'outline'}
              onClick={() => setShowInactive((v) => !v)}
            >
              Mostrar inativos
            </Button>
          </div>
          {renderUserTable(clientes)}
        </TabsContent>

        <TabsContent value="admins">
          {renderUserTable(admins)}
        </TabsContent>

        <TabsContent value="produtores">
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
                      Nenhum fornecedor cadastrado.
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
                  Nenhum fornecedor cadastrado.
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
              <h2 className="font-semibold">Cotas</h2>
              <div className="space-y-1 max-w-xs">
                <Label>Termo da cota</Label>
                <Input
                  value={quotaTermInput}
                  onChange={(e) => setQuotaTermInput(e.target.value)}
                  placeholder="Ex: Fornada, Cota, Cesta"
                />
                <p className="text-xs text-muted-foreground">Rótulo exibido no lugar de "Cota".</p>
              </div>
              <div className="space-y-2">
                <Label>Tipos de cota (R$/semana)</Label>
                {tierRows.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      value={r.name}
                      onChange={(e) => updateTier(r.id, 'name', e.target.value)}
                      placeholder="Nome (ex: Fornada Completa)"
                    />
                    <Input
                      className="w-28"
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.price}
                      onChange={(e) => updateTier(r.id, 'price', e.target.value)}
                      placeholder="R$"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeTier(r)} title="Remover">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addTier}>
                  <Plus className="mr-2 h-4 w-4" /> Adicionar cota
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Frete por entrega (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={freteDelivery}
                    onChange={(e) => setFreteDelivery(e.target.value)}
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
              <h2 className="font-semibold pt-2">Agendamento</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Dia de envio dos extras</Label>
                  <select
                    value={orderSendDay}
                    onChange={(e) => setOrderSendDay(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    {['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'].map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Horário de envio (h)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={orderSendHour}
                    onChange={(e) => setOrderSendHour(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Dia de troca de semana</Label>
                  <select
                    value={weekChangeDay}
                    onChange={(e) => setWeekChangeDay(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    {['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'].map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
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

        {MULTI_TENANT && isSuperadmin(user) && (
          <TabsContent value="tenants">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Criada em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{new Date(c.dateCreated).toLocaleDateString('pt-BR')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Dialog: nova organização */}
      <Dialog open={tenantDialog} onOpenChange={setTenantDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Organização</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTenant()}
                placeholder="Ex: Padaria Central"
              />
            </div>
            {tenantError && <p className="text-sm text-destructive">{tenantError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTenantDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateTenant} disabled={savingTenant || !newTenantName.trim()}>
              {savingTenant ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: produtor */}
      <Dialog open={producerDialog} onOpenChange={setProducerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProducer ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
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

      {/* Dialog: novo usuário */}
      <Dialog open={memberDialog} onOpenChange={(open) => { if (!open) { setMemberDialog(false); setMemberSuccess(null) } }}>
        <DialogContent onOpenAutoFocus={(e) => { e.preventDefault(); memberFirstFieldRef.current?.focus() }}>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
          </DialogHeader>
          {memberSuccess ? (
            <>
              <div className="py-4 space-y-2 text-sm">
                <p className="font-medium text-green-700">Usuário criado com sucesso!</p>
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
                <Input ref={memberFirstFieldRef} value={memberForm.name} onChange={(e) => setMember('name', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Contato</Label>
                <Input value={memberForm.contact} onChange={(e) => setMember('contact', e.target.value)} placeholder="+55 11 99999-9999" />
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
            <TipoSelector
              name="tipo-novo"
              acesso={memberForm.acesso}
              onChange={(a) => setMemberForm((p) => ({ ...p, acesso: a }))}
            />
            {memberForm.acesso.includes('fornecedor') && (
              <div className="space-y-1">
                <Label>Fornecedor vinculado</Label>
                {producers.length > 1 ? (
                  <Select value={memberForm.producerId ?? ''} onValueChange={(v) => setMember('producerId', v)}>
                    <SelectTrigger><SelectValue placeholder="Vincular a um fornecedor..." /></SelectTrigger>
                    <SelectContent>
                      {producers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : producers[0] ? (
                  <p className="text-xs text-muted-foreground">Vinculado a: {producers[0].name}</p>
                ) : null}
              </div>
            )}
            {memberIsCliente && (
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
            )}
            {memberIsCliente && (
              <div className="space-y-1">
                <Label>{quotaTerm}</Label>
                <Select value={memberForm.quota ?? ''} onValueChange={(v) => setMember('quota', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {quotaTiers.map((q) => <SelectItem key={q.name} value={q.name}>{q.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Função</Label>
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
                            if (!tenant) return
                            await rolesApi.delete(r.id, tenant.id)
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
                      if (!newRoleName.trim() || !tenant) return
                      const created = await rolesApi.create(newRoleName.trim(), tenant.id)
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
            {memberIsCliente && (
              <>
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
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="memberAcolhida"
                    checked={inAcolhida}
                    onChange={(e) => setInAcolhida(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="memberAcolhida" className="font-normal cursor-pointer">
                    Em acolhida (30 dias)
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
                        <SelectItem value="retirada">Retirada na loja</SelectItem>
                        <SelectItem value="entrega">Entrega</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
            {memberError && <p className="text-sm text-destructive">{memberError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveMember}
              disabled={savingMember || !memberForm.name || !memberForm.email}
            >
              {savingMember ? 'Criando...' : 'Criar usuário'}
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
            <DialogTitle>Importar clientes via CSV</DialogTitle>
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
                        <td className="py-1 pr-3 capitalize">{r.deliveryType === 'retirada' ? 'Retirada' : 'Entrega'}</td>
                        <td className="py-1 capitalize">{r.frequency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCsvRows([])}>Voltar</Button>
                <Button onClick={handleCsvImport} disabled={csvImporting}>
                  {csvImporting ? 'Criando...' : `Criar ${csvRows.length} cliente${csvRows.length > 1 ? 's' : ''}`}
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

      {/* Dialog: editar usuário */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent onOpenAutoFocus={(e) => { e.preventDefault(); editFirstFieldRef.current?.focus() }}>
          <DialogHeader>
            <DialogTitle>Editar — {editingUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input ref={editFirstFieldRef} value={editForm.name ?? ''} onChange={(e) => setEdit('name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Contato</Label>
              <Input value={editForm.contact ?? ''} onChange={(e) => setEdit('contact', e.target.value)} />
            </div>
            <TipoSelector
              name="tipo-editar"
              acesso={acessos(editForm)}
              onChange={(a) => setEditForm((p) => ({ ...p, acesso: a }))}
            />
            {acessos(editForm).includes('fornecedor') && (
              <div className="space-y-1">
                <Label>Fornecedor vinculado</Label>
                {producers.length > 1 ? (
                  <Select value={editForm.producerId ?? ''} onValueChange={(v) => setEdit('producerId', v)}>
                    <SelectTrigger><SelectValue placeholder="Vincular a um fornecedor..." /></SelectTrigger>
                    <SelectContent>
                      {producers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : producers[0] ? (
                  <p className="text-xs text-muted-foreground">Vinculado a: {producers[0].name}</p>
                ) : null}
              </div>
            )}
            {editIsCliente && (
              <>
                <div className="space-y-1">
                  <Label>Endereço</Label>
                  <Input value={editForm.address ?? ''} onChange={(e) => setEdit('address', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Bairro</Label>
                  <Input value={editForm.neighborhood ?? ''} onChange={(e) => setEdit('neighborhood', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{quotaTerm}</Label>
                  <Select value={editForm.quota ?? ''} onValueChange={(v) => setEdit('quota', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {quotaTiers.map((q) => <SelectItem key={q.name} value={q.name}>{q.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>Função</Label>
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
                            if (!tenant) return
                            await rolesApi.delete(r.id, tenant.id)
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
                      if (!newRoleName.trim() || !tenant) return
                      const created = await rolesApi.create(newRoleName.trim(), tenant.id)
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
            {editIsCliente && (
            <>
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
            <div className="space-y-1">
              <Label>Acolhida — encerramento</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={editForm.acolhidaExpiry ?? ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, acolhidaExpiry: e.target.value }))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditForm((p) => ({ ...p, acolhidaExpiry: '' }))}
                >
                  Remover
                </Button>
              </div>
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
                    <SelectItem value="retirada">Retirada na loja</SelectItem>
                    <SelectItem value="entrega">Entrega</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editForm.deliveryType === 'entrega' && (
              <div className="space-y-1">
                <Label>Frete por entrega (R$) — opcional</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`Padrão da tenant: R$ ${(tenant?.freteDelivery ?? 0).toFixed(2)}`}
                  value={editForm.freteDelivery ?? ''}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      freteDelivery: e.target.value === '' ? undefined : Number(e.target.value),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">Vazio = usa o padrão da tenant.</p>
              </div>
            )}
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
            </>
            )}
          </div>
          <div className="pt-2 border-t space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={resettingPassword}
              onClick={async () => {
                if (!editingUser || !tenant) return
                setResettingPassword(true)
                setResetLink(null)
                try {
                  const { link, whatsappSent } = await usersApi.resetPassword(editingUser.id, tenant.id)
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
