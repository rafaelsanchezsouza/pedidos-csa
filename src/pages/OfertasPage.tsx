import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, X, History, Pencil, Lock, Unlock, ListPlus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { offeringsApi, producersApi, productsApi, tenantsApi } from '@/services/api'
import { formatDeliveryDate, getPresentWeekId } from '@/lib/weekUtils'
import { WeekNavigator } from '@/components/WeekNavigator'
import { PageHeader } from '@/components/PageHeader'
import type { WeeklyOffering, Producer, Product, OfferingDraftItem, OfferingItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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


export function OfertasPage() {
  const { tenant } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [offerings, setOfferings] = useState<WeeklyOffering[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedProducerId, setSelectedProducerId] = useState('')
  const [itens, setItens] = useState<OfferingDraftItem[] | null>(null)
  const [gerando, setGerando] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallingBack, setFallingBack] = useState<string | null>(null)
  const [fallbackMessage, setFallbackMessage] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<WeeklyOffering | null>(null)
  const [extrasAberto, setExtrasAberto] = useState<boolean>(true)
  const [togglingExtras, setTogglingExtras] = useState(false)

  const [weekId, setWeekId] = useState(getPresentWeekId())

  const load = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    try {
      const [offs, prods, prdsrs, freshTenant] = await Promise.all([
        offeringsApi.list(weekId, tenant.id),
        producersApi.list(tenant.id),
        productsApi.list(tenant.id),
        tenantsApi.get(tenant.id),
      ])
      setOfferings(offs)
      setProducers(prods)
      setProducts(prdsrs)
      setExtrasAberto(freshTenant.extrasAberto ?? true)
    } catch {
      // silencioso — erros de carregamento não são exibidos ao usuário aqui
    } finally {
      setLoading(false)
    }
  }, [tenant, weekId])

  useEffect(() => { load() }, [load])

  async function handleToggleExtras() {
    if (!tenant) return
    setTogglingExtras(true)
    try {
      const novo = !extrasAberto
      await tenantsApi.update(tenant.id, { extrasAberto: novo })
      setExtrasAberto(novo)
    } finally {
      setTogglingExtras(false)
    }
  }

  // Itens do catálogo ativo de um fornecedor, no formato do formulário de oferta
  const rascunhoDoCatalogo = useCallback((producerId: string): OfferingDraftItem[] =>
    products
      .filter((p) => p.producerId === producerId && p.ativo !== false)
      .map((p) => ({
        name: p.name,
        unit: p.unit,
        price: p.price,
        type: p.type ?? 'extra',
        matchedProductId: p.id,
      })), [products])

  // Auto-abre dialog se producerId vier por URL (fluxo: Admin → Novo Fornecedor)
  useEffect(() => {
    const pid = searchParams.get('producerId')
    if (pid && producers.length > 0) {
      setSelectedProducerId(pid)
      setItens(rascunhoDoCatalogo(pid))
      setDialogOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [producers, searchParams, setSearchParams, rascunhoDoCatalogo])

  // Com 1 fornecedor (a própria loja), a seleção some da UI e ele é usado direto.
  const multiFornecedor = producers.length > 1

  function openDialog(producerId = '') {
    setEditing(null)
    const pid = producerId || (producers.length === 1 ? producers[0].id : '')
    setSelectedProducerId(pid)
    setItens(pid ? rascunhoDoCatalogo(pid) : [])
    setDialogOpen(true)
  }

  function openEdit(off: WeeklyOffering) {
    setEditing(off)
    setSelectedProducerId(off.producerId)
    setItens(off.items.map((i) => ({
      name: i.productName,
      unit: i.unit,
      price: i.price,
      type: i.type,
      matchedProductId: i.productId,
    })))
    setDialogOpen(true)
  }

  // Troca de fornecedor no dialog de criação → recarrega o rascunho do catálogo dele
  function handleProducerChange(producerId: string) {
    setSelectedProducerId(producerId)
    if (!editing) setItens(rascunhoDoCatalogo(producerId))
  }

  async function handleFallback(producerId: string) {
    if (!tenant) return
    setFallingBack(producerId)
    setFallbackMessage((prev) => ({ ...prev, [producerId]: '' }))
    try {
      const result = await offeringsApi.fallback(weekId, tenant.id, producerId)
      if (result.length === 0) {
        setFallbackMessage((prev) => ({ ...prev, [producerId]: 'Nenhuma oferta anterior encontrada.' }))
      } else {
        await load()
      }
    } catch (err) {
      setFallbackMessage((prev) => ({
        ...prev,
        [producerId]: err instanceof Error ? err.message : 'Erro ao copiar oferta.',
      }))
    } finally {
      setFallingBack(null)
    }
  }

  // Publica a oferta da semana direto do catálogo, sem passar pelo formulário
  async function handleGerarDoCatalogo(producerId: string) {
    if (!tenant) return
    setGerando(producerId)
    setFallbackMessage((prev) => ({ ...prev, [producerId]: '' }))
    try {
      const result = await offeringsApi.fromCatalog(weekId, tenant.id, producerId)
      if (result.length === 0) {
        setFallbackMessage((prev) => ({
          ...prev,
          [producerId]: 'Nenhum produto ativo no catálogo deste fornecedor.',
        }))
      } else {
        await load()
      }
    } catch (err) {
      setFallbackMessage((prev) => ({
        ...prev,
        [producerId]: err instanceof Error ? err.message : 'Erro ao gerar oferta.',
      }))
    } finally {
      setGerando(null)
    }
  }

  function updateItem(idx: number, field: keyof OfferingDraftItem, value: string | number) {
    if (!itens) return
    const updated = [...itens]
    updated[idx] = { ...updated[idx], [field]: value }
    setItens(updated)
  }

  function removeItem(idx: number) {
    if (!itens) return
    setItens(itens.filter((_, i) => i !== idx))
  }

  function addItem() {
    setItens([...(itens ?? []), { name: '', unit: 'unid', price: 0, type: 'extra' }])
  }

  async function handleSave() {
    if (!tenant || !selectedProducerId || !itens) return
    setError(null)
    setSaving(true)
    try {
      const producer = producers.find((p) => p.id === selectedProducerId)
      const items: OfferingItem[] = itens.map((p) => ({
        productId: p.matchedProductId || crypto.randomUUID(),
        productName: p.name,
        unit: p.unit,
        price: p.price,
        type: p.type,
      }))
      if (editing) {
        await offeringsApi.update(editing.id, { items }, tenant.id)
      } else {
        await offeringsApi.create({
          producerId: selectedProducerId,
          producerName: producer?.name ?? '',
          tenantId: tenant.id,
          items,
          weekStart: weekId,
        }, tenant.id)
      }
      setDialogOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar oferta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Extras da Semana"
        subtitle={`Entrega em ${formatDeliveryDate(weekId)}`}
        primaryAction={
          <Button
            variant={extrasAberto ? 'outline' : 'destructive'}
            size="sm"
            onClick={handleToggleExtras}
            disabled={togglingExtras}
          >
            {extrasAberto
              ? <><Unlock className="h-4 w-4 mr-1" />Extras abertos</>
              : <><Lock className="h-4 w-4 mr-1" />Extras encerrados</>
            }
          </Button>
        }
        dateNav={<WeekNavigator weekId={weekId} onChange={setWeekId} />}
      />

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Carregando...</div>
      ) : (
        <>
          {/* Fornecedores sem oferta nesta semana */}
          {producers
            .filter((p) => !offerings.some((o) => o.producerId === p.id))
            .map((p) => (
              <Card key={p.id} className="border-dashed opacity-70">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg text-muted-foreground">{multiFornecedor ? p.name : 'Oferta da semana'}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFallback(p.id)}
                      disabled={fallingBack === p.id}
                    >
                      <History className="mr-2 h-4 w-4" />
                      {fallingBack === p.id ? 'Copiando...' : 'Semana anterior'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openDialog(p.id)}>
                      <Plus className="mr-2 h-4 w-4" /> Ajustar
                    </Button>
                    <Button size="sm" onClick={() => handleGerarDoCatalogo(p.id)} disabled={gerando === p.id}>
                      <ListPlus className="mr-2 h-4 w-4" />
                      {gerando === p.id ? 'Gerando...' : 'Gerar do catálogo'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Sem oferta para esta semana.</p>
                  {fallbackMessage[p.id] && (
                    <p className="text-sm text-muted-foreground mt-1">{fallbackMessage[p.id]}</p>
                  )}
                </CardContent>
              </Card>
            ))}

          {offerings.length === 0 && producers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhuma oferta cadastrada para esta semana.
              </CardContent>
            </Card>
          ) : (
            offerings.map((off) => (
              <Card key={off.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg">{multiFornecedor ? off.producerName : 'Oferta da semana'}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(off)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {off.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span>{item.productName}</span>
                          <span className="text-muted-foreground">({item.unit})</span>
                        </div>
                        <span className="font-medium">R$ {item.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setError(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Oferta' : 'Nova Oferta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {multiFornecedor && (
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Select value={selectedProducerId} onValueChange={handleProducerChange} disabled={!!editing}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o fornecedor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {producers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {itens && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Itens da oferta ({itens.length})</Label>
                  <Button variant="ghost" size="sm" onClick={addItem}>
                    <Plus className="mr-1 h-3 w-3" /> Adicionar item
                  </Button>
                </div>
                {itens.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum produto ativo no catálogo deste fornecedor.
                  </p>
                )}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {itens.map((item, idx) => (
                    <div key={idx} className="border rounded-md p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 grid grid-cols-4 gap-2">
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Nome</Label>
                            <Input
                              value={item.name}
                              onChange={(e) => updateItem(idx, 'name', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Unid</Label>
                            <Input
                              value={item.unit}
                              onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Preço</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.price}
                              onChange={(e) => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 pt-5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive px-1">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !selectedProducerId || !itens || itens.length === 0}
            >
              {saving ? 'Salvando...' : 'Salvar Oferta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
