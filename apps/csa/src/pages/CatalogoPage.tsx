import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Upload } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { productsApi, producersApi } from '@/services/api'
import type { ProductBatchResult } from '@/services/api'
import type { Product, Producer } from '@/types'
import { parseCsvLine, parsePrice } from '@pedidos/core'
import { Button, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pedidos/core/ui'
import { PageHeader } from '@pedidos/core/ui'

interface ProductForm {
  name: string
  unit: string
  price: string
  producerId: string
}

const emptyForm: ProductForm = { name: '', unit: 'unid', price: '', producerId: '' }

// Linha do CSV já resolvida contra os produtores da colmeia.
// producerId vazio = produtor não encontrado (linha não será importada).
interface CatalogRow {
  producerName: string
  producerId: string
  name: string
  unit: string
  price: number
}

// Formato: produtor,produto,unidade,preco (com cabeçalho na 1ª linha).
function parseCatalogCsv(text: string, producers: Producer[]): CatalogRow[] {
  const byName = new Map(producers.map((p) => [p.name.trim().toLowerCase(), p.id]))
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.slice(1).map((line) => {
    const c = parseCsvLine(line)
    const producerName = c[0]?.trim() ?? ''
    return {
      producerName,
      producerId: byName.get(producerName.toLowerCase()) ?? '',
      name: c[1]?.trim() ?? '',
      unit: c[2]?.trim() || 'unid',
      price: parsePrice(c[3] ?? ''),
    }
  }).filter((r) => r.name)
}

export function CatalogoPage() {
  const { colmeia } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
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
    if (!colmeia) return
    setLoading(true)
    try {
      const [prods, prodsrs] = await Promise.all([
        productsApi.list(colmeia.id),
        producersApi.list(colmeia.id),
      ])
      setProducts(prods)
      setProducers(prodsrs)
    } finally {
      setLoading(false)
    }
  }, [colmeia])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({ name: p.name, unit: p.unit, price: String(p.price), producerId: p.producerId })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!colmeia) return
    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        unit: form.unit.trim(),
        price: parseFloat(form.price),
        producerId: form.producerId,
        tenantId: colmeia.id,
      }
      if (editing) {
        await productsApi.update(editing.id, data, colmeia.id)
      } else {
        await productsApi.create(data, colmeia.id)
      }
      setDialogOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!colmeia || !confirm('Excluir este produto?')) return
    await productsApi.delete(id, colmeia.id)
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }

  // --- Importar CSV ---
  function handleCsvFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      setCsvRows(parseCatalogCsv(e.target?.result as string, producers))
      setCsvResults(null)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleCsvImport() {
    if (!colmeia) return
    const validas = csvRows.filter((r) => r.producerId)
    if (validas.length === 0) return
    setCsvImporting(true)
    try {
      const payload = validas.map((r) => ({
        name: r.name,
        unit: r.unit,
        price: r.price,
        producerId: r.producerId,
        tenantId: colmeia.id,
      }))
      const { results } = await productsApi.importBatch(payload, colmeia.id)
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

  const producerName = (id: string) => producers.find((p) => p.id === id)?.name ?? '-'

  const visibleProducts = products
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
        <Select value={filterProducer} onValueChange={setFilterProducer}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Todos os produtores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os produtores</SelectItem>
            {producers.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              <TableHead>Produtor</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {products.length === 0 ? 'Nenhum produto cadastrado.' : 'Nenhum produto para este produtor.'}
                </TableCell>
              </TableRow>
            ) : (
              visibleProducts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.unit}</TableCell>
                  <TableCell>R$ {p.price.toFixed(2)}</TableCell>
                  <TableCell>{producerName(p.producerId)}</TableCell>
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
              {products.length === 0 ? 'Nenhum produto cadastrado.' : 'Nenhum produto para este produtor.'}
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
                  {producerName(p.producerId)} · {p.unit} · R$ {p.price.toFixed(2)}
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
            <div className="space-y-2">
              <Label>Produtor</Label>
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
                Colunas esperadas (com cabeçalho): <code>produtor,produto,unidade,preco</code>. O produtor
                precisa já estar cadastrado — o nome é casado sem diferenciar maiúsculas.
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
                    {invalidas} linha{invalidas > 1 ? 's' : ''} com produtor não cadastrado — {invalidas > 1 ? 'serão ignoradas' : 'será ignorada'}.
                  </p>
                )}
                <div className="py-2 max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="pb-1 pr-3">Produto</th>
                        <th className="pb-1 pr-3">Produtor</th>
                        <th className="pb-1 pr-3">Unidade</th>
                        <th className="pb-1">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map((r, i) => (
                        <tr key={i} className={`border-b last:border-0 ${r.producerId ? '' : 'opacity-50'}`}>
                          <td className="py-1 pr-3 font-medium">{r.name}</td>
                          <td className="py-1 pr-3">
                            {r.producerId
                              ? r.producerName
                              : <span className="text-destructive" title="Produtor não cadastrado">{r.producerName || '—'} ✗</span>}
                          </td>
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
