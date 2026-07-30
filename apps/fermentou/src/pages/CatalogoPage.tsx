import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Upload } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin, isFornecedor } from '@pedidos/core'
import { productsApi, producersApi } from '@/services/api'
import type { ProductBatchResult } from '@/services/api'
import type { Product, Producer } from '@/types'
import { parseCsvLine, parsePrice } from '@pedidos/core'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
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

interface ProductForm {
  name: string
  unit: string
  price: string
  producerId: string
  type: 'fixo' | 'extra'
  ativo: boolean
}

const emptyForm: ProductForm = { name: '', unit: 'unid', price: '', producerId: '', type: 'extra', ativo: true }

// Linha do CSV já resolvida contra os fornecedores do tenant.
// producerId vazio = fornecedor não encontrado (linha não será importada).
interface CatalogRow {
  producerName: string
  producerId: string
  name: string
  unit: string
  price: number
}

// Formato: fornecedor,produto,unidade,preco (com cabeçalho na 1ª linha).
// forcedProducerId: fornecedor logado importa direto no próprio contexto (coluna ignorada).
// Com um único fornecedor, a coluna pode ficar vazia (assume o fornecedor único).
function parseCatalogCsv(text: string, producers: Producer[], forcedProducerId?: string): CatalogRow[] {
  const byName = new Map(producers.map((p) => [p.name.trim().toLowerCase(), p.id]))
  const soloId = producers.length === 1 ? producers[0].id : ''
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.slice(1).map((line) => {
    const c = parseCsvLine(line)
    const producerName = c[0]?.trim() ?? ''
    const producerId = forcedProducerId || byName.get(producerName.toLowerCase()) || soloId
    return {
      producerName,
      producerId,
      name: c[1]?.trim() ?? '',
      unit: c[2]?.trim() || 'unid',
      price: parsePrice(c[3] ?? ''),
    }
  }).filter((r) => r.name)
}

export function CatalogoPage() {
  const { tenant, user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [allProducers, setAllProducers] = useState<Producer[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterProducer, setFilterProducer] = useState('todos')
  const [filterName, setFilterName] = useState('')

  // Importação por CSV
  const [csvDialog, setCsvDialog] = useState(false)
  const [csvRows, setCsvRows] = useState<CatalogRow[]>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResults, setCsvResults] = useState<ProductBatchResult[] | null>(null)

  const load = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    try {
      const [prods, prodsrs] = await Promise.all([
        productsApi.list(tenant.id),
        producersApi.list(tenant.id),
      ])
      setProducts(prods)
      setAllProducers(prodsrs)
    } finally {
      setLoading(false)
    }
  }, [tenant])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    // Com fornecedor único, já entra atribuído a ele (o campo fica oculto no form).
    setForm({ ...emptyForm, producerId: producers.length === 1 ? producers[0].id : '' })
    setDialogOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: p.name,
      unit: p.unit,
      price: String(p.price),
      producerId: p.producerId,
      type: p.type ?? 'extra',
      ativo: p.ativo !== false,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!tenant) return
    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        unit: form.unit.trim(),
        price: parseFloat(form.price),
        producerId: form.producerId,
        tenantId: tenant.id,
        type: form.type,
        ativo: form.ativo,
      }
      if (editing) {
        await productsApi.update(editing.id, data, tenant.id)
      } else {
        await productsApi.create(data, tenant.id)
      }
      setDialogOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!tenant || !confirm('Excluir este produto?')) return
    await productsApi.delete(id, tenant.id)
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }

  // --- Importar CSV ---
  function handleCsvFile(file: File) {
    const forcedProducerId = soFornecedor ? user?.producerId : undefined
    const reader = new FileReader()
    reader.onload = (e) => {
      setCsvRows(parseCatalogCsv(e.target?.result as string, producers, forcedProducerId))
      setCsvResults(null)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleCsvImport() {
    if (!tenant) return
    const validas = csvRows.filter((r) => r.producerId)
    if (validas.length === 0) return
    setCsvImporting(true)
    try {
      const payload = validas.map((r) => ({
        name: r.name,
        unit: r.unit,
        price: r.price,
        producerId: r.producerId,
        tenantId: tenant.id,
        type: 'extra' as const,
        ativo: true,
      }))
      const { results } = await productsApi.importBatch(payload, tenant.id)
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

  // Fornecedor não-admin só enxerga/gerencia o próprio contexto (seu producerId). Admin vê tudo.
  const soFornecedor = isFornecedor(user) && !isAdmin(user)
  const producers = soFornecedor ? allProducers.filter((p) => p.id === user?.producerId) : allProducers

  const producerName = (id: string) => producers.find((p) => p.id === id)?.name ?? '-'
  // Com 1 fornecedor (a própria loja), a seleção de fornecedor some da UI. Reaparece ao adicionar o 2º.
  const multiFornecedor = producers.length > 1

  const visibleProducts = products
    .filter((p) => !soFornecedor || p.producerId === user?.producerId)
    .filter((p) => filterProducer === 'todos' || p.producerId === filterProducer)
    .filter((p) => !filterName.trim() || p.name.toLowerCase().includes(filterName.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  // Guarda mantida: o vazio desta tela vive dentro de <TableRow>, incompatível com
  // EstadoLista (baseado em Card). Sem ela, a tabela anuncia "Nenhum produto cadastrado"
  // enquanto os dados ainda estão vindo.
  if (loading) return <div className="text-muted-foreground">Carregando...</div>

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Catálogo de Produtos"
        secondaryAction={
          <Button variant="outline" onClick={() => setCsvDialog(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importar CSV
          </Button>
        }
        primaryAction={
          <Button onClick={openCreate}>
            <Plus className="mr-2" /> Novo Produto
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        {multiFornecedor && (
          <Select value={filterProducer} onValueChange={setFilterProducer}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Todos os fornecedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os fornecedores</SelectItem>
              {producers.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          placeholder="Buscar por nome..."
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          className="w-full sm:w-56"
        />
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Preço</TableHead>
              {multiFornecedor && <TableHead>Fornecedor</TableHead>}
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={multiFornecedor ? 5 : 4} className="text-center text-muted-foreground py-8">
                  {products.length === 0 ? 'Nenhum produto cadastrado.' : 'Nenhum produto para este fornecedor.'}
                </TableCell>
              </TableRow>
            ) : (
              visibleProducts.map((p) => (
                <TableRow key={p.id} className={p.ativo === false ? 'opacity-50' : undefined}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.type === 'fixo' && (
                      <span className="ml-2 text-xs text-muted-foreground">fixo</span>
                    )}
                    {p.ativo === false && (
                      <span className="ml-2 text-xs text-muted-foreground">fora de linha</span>
                    )}
                  </TableCell>
                  <TableCell>{p.unit}</TableCell>
                  <TableCell>R$ {p.price.toFixed(2)}</TableCell>
                  {multiFornecedor && <TableCell>{producerName(p.producerId)}</TableCell>}
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
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
      <div className="md:hidden space-y-2">
        {visibleProducts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {products.length === 0 ? 'Nenhum produto cadastrado.' : 'Nenhum produto para este fornecedor.'}
            </CardContent>
          </Card>
        ) : (
          visibleProducts.map((p) => (
            <Card key={p.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {multiFornecedor ? `${producerName(p.producerId)} · ` : ''}{p.unit} · R$ {p.price.toFixed(2)}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="unid, kg, maço..."
                />
              </div>
              <div className="space-y-2">
                <Label>Preço (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
            </div>
            {multiFornecedor && (
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Select value={form.producerId} onValueChange={(v) => setForm({ ...form, producerId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {producers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v as 'fixo' | 'extra' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="extra">Extra (pedido avulso)</SelectItem>
                    <SelectItem value="fixo">Fixo (cobrado na cota)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Situação</Label>
                <Select
                  value={form.ativo ? 'ativo' : 'inativo'}
                  onValueChange={(v) => setForm({ ...form, ativo: v === 'ativo' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Fora de linha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.producerId}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: importar catálogo via CSV */}
      <Dialog open={csvDialog} onOpenChange={(open) => { if (!open) closeCsvDialog() }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar catálogo via CSV</DialogTitle>
          </DialogHeader>

          {!csvResults && csvRows.length === 0 && (
            <div className="py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Colunas esperadas (com cabeçalho): <code>fornecedor,produto,unidade,preco</code>.
                {multiFornecedor
                  ? ' O fornecedor precisa já estar cadastrado — o nome é casado sem diferenciar maiúsculas.'
                  : ' A coluna fornecedor pode ficar vazia.'}{' '}
                Produtos entram como <em>extra</em> e ativos.
              </p>
              <a href="/exemplo-catalogo.csv" download className="text-sm text-primary underline">
                Baixar CSV de exemplo
              </a>
              <input
                type="file"
                accept=".csv"
                className="block text-sm"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f) }}
              />
            </div>
          )}

          {!csvResults && csvRows.length > 0 && (() => {
            const validas = csvRows.filter((r) => r.producerId).length
            const invalidas = csvRows.length - validas
            return (
              <>
                {invalidas > 0 && (
                  <p className="text-sm text-destructive">
                    {invalidas} linha{invalidas > 1 ? 's' : ''} com fornecedor não cadastrado — {invalidas > 1 ? 'serão ignoradas' : 'será ignorada'}.
                  </p>
                )}
                <div className="py-2 max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="pb-1 pr-3">Produto</th>
                        {multiFornecedor && <th className="pb-1 pr-3">Fornecedor</th>}
                        <th className="pb-1 pr-3">Unidade</th>
                        <th className="pb-1">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map((r, i) => (
                        <tr key={i} className={`border-b last:border-0 ${r.producerId ? '' : 'opacity-50'}`}>
                          <td className="py-1 pr-3 font-medium">{r.name}</td>
                          {multiFornecedor && (
                            <td className="py-1 pr-3">
                              {r.producerId
                                ? (producerName(r.producerId) === '-' ? r.producerName : producerName(r.producerId))
                                : <span className="text-destructive" title="Fornecedor não cadastrado">{r.producerName || '—'} ✗</span>}
                            </td>
                          )}
                          <td className="py-1 pr-3">{r.unit}</td>
                          <td className="py-1">R$ {r.price.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCsvRows([])}>Voltar</Button>
                  <Button onClick={handleCsvImport} disabled={csvImporting || validas === 0}>
                    {csvImporting ? 'Importando...' : `Importar ${validas} produto${validas > 1 ? 's' : ''}`}
                  </Button>
                </DialogFooter>
              </>
            )
          })()}

          {csvResults && (
            <>
              <div className="py-2 max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="pb-1 pr-3">Produto</th>
                      <th className="pb-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvResults.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 pr-3 font-medium">{r.name}</td>
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
    </div>
  )
}
