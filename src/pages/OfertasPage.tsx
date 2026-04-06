import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Wand2, Check, X, History, Pencil } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { offeringsApi, producersApi, productsApi } from '@/services/api'
import { formatDeliveryDate, getPresentWeekId } from '@/lib/weekUtils'
import { WeekNavigator } from '@/components/WeekNavigator'
import type { WeeklyOffering, Producer, Product, ParsedProduct, OfferingItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
  const { colmeia } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [offerings, setOfferings] = useState<WeeklyOffering[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedProducerId, setSelectedProducerId] = useState('')
  const [rawMessage, setRawMessage] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParsedProduct[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallingBack, setFallingBack] = useState<string | null>(null)
  const [fallbackMessage, setFallbackMessage] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<WeeklyOffering | null>(null)

  const [weekId, setWeekId] = useState(getPresentWeekId())

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    try {
      const [offs, prods, prdsrs] = await Promise.all([
        offeringsApi.list(weekId, colmeia.id),
        producersApi.list(colmeia.id),
        productsApi.list(colmeia.id),
      ])
      setOfferings(offs)
      setProducers(prods)
      setProducts(prdsrs)
    } catch {
      // silencioso — erros de carregamento não são exibidos ao usuário aqui
    } finally {
      setLoading(false)
    }
  }, [colmeia, weekId])

  useEffect(() => { load() }, [load])

  // Auto-abre dialog se producerId vier por URL (fluxo: Admin → Novo Produtor)
  useEffect(() => {
    const pid = searchParams.get('producerId')
    if (pid && producers.length > 0) {
      setSelectedProducerId(pid)
      setRawMessage('')
      setParsed(null)
      setDialogOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [producers, searchParams, setSearchParams])

  function openDialog(producerId = '') {
    setEditing(null)
    setSelectedProducerId(producerId)
    setRawMessage('')
    setParsed(null)
    setDialogOpen(true)
  }

  function openEdit(off: WeeklyOffering) {
    setEditing(off)
    setSelectedProducerId(off.producerId)
    setRawMessage(off.rawMessage ?? '')
    setParsed(off.items.map((i) => ({
      name: i.productName,
      unit: i.unit,
      price: i.price,
      type: i.type,
      matchedProductId: i.productId,
    })))
    setDialogOpen(true)
  }

  async function handleFallback(producerId: string) {
    if (!colmeia) return
    setFallingBack(producerId)
    setFallbackMessage((prev) => ({ ...prev, [producerId]: '' }))
    try {
      const result = await offeringsApi.fallback(weekId, colmeia.id, producerId)
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

  async function handleParse() {
    if (!colmeia || !rawMessage.trim()) return
    setError(null)
    setParsing(true)
    try {
      const result = await offeringsApi.parse(rawMessage, colmeia.id, selectedProducerId)
      setParsed(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao interpretar mensagem')
    } finally {
      setParsing(false)
    }
  }

  function updateParsed(idx: number, field: keyof ParsedProduct, value: string | number) {
    if (!parsed) return
    const updated = [...parsed]
    updated[idx] = { ...updated[idx], [field]: value }
    setParsed(updated)
  }

  function removeParsed(idx: number) {
    if (!parsed) return
    setParsed(parsed.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!colmeia || !selectedProducerId || !parsed) return
    setError(null)
    setSaving(true)
    try {
      const producer = producers.find((p) => p.id === selectedProducerId)
      const items: OfferingItem[] = parsed.map((p) => ({
        productId: p.matchedProductId || crypto.randomUUID(),
        productName: p.name,
        unit: p.unit,
        price: p.price,
        type: p.type,
      }))
      if (editing) {
        await offeringsApi.update(editing.id, { items, rawMessage }, colmeia.id)
      } else {
        await offeringsApi.create({
          producerId: selectedProducerId,
          producerName: producer?.name ?? '',
          colmeiaId: colmeia.id,
          items,
          weekStart: weekId,
          rawMessage,
        }, colmeia.id)
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
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ofertas da Semana</h1>
          <p className="text-muted-foreground text-sm">Entrega em {formatDeliveryDate(weekId)}</p>
        </div>
        <WeekNavigator weekId={weekId} onChange={setWeekId} />
      </div>

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Carregando...</div>
      ) : (
        <>
          {/* Produtores sem oferta nesta semana */}
          {producers
            .filter((p) => !offerings.some((o) => o.producerId === p.id))
            .map((p) => (
              <Card key={p.id} className="border-dashed opacity-70">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg text-muted-foreground">{p.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFallback(p.id)}
                      disabled={fallingBack === p.id}
                    >
                      <History className="mr-2 h-4 w-4" />
                      {fallingBack === p.id ? 'Copiando...' : 'Usar semana anterior'}
                    </Button>
                    <Button size="sm" onClick={() => openDialog(p.id)}>
                      <Plus className="mr-2 h-4 w-4" /> Nova Oferta
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
                  <CardTitle className="text-lg">{off.producerName}</CardTitle>
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
                          <Badge variant={item.type === 'fixo' ? 'default' : 'secondary'} className="text-xs">
                            {item.type}
                          </Badge>
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
            <div className="space-y-2">
              <Label>Produtor</Label>
              <Select value={selectedProducerId} onValueChange={setSelectedProducerId} disabled={!!editing}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produtor..." />
                </SelectTrigger>
                <SelectContent>
                  {producers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mensagem do WhatsApp</Label>
              <Textarea
                autoFocus
                value={rawMessage}
                onChange={(e) => setRawMessage(e.target.value)}
                placeholder="Cole aqui a mensagem do produtor..."
                className="min-h-[120px]"
              />
              <Button
                variant="outline"
                onClick={handleParse}
                disabled={parsing || !rawMessage.trim()}
                className="w-full"
              >
                <Wand2 className="mr-2" />
                {parsing ? 'Gerando...' : 'Gerar Oferta'}
              </Button>
            </div>

            {parsed && (
              <div className="space-y-2">
                <Label>Produtos identificados ({parsed.length})</Label>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {parsed.map((item, idx) => {
                    const match = products.find((p) => p.id === item.matchedProductId)
                    return (
                      <div key={idx} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 grid grid-cols-4 gap-2">
                            <div className="col-span-2 space-y-1">
                              <Label className="text-xs">Nome</Label>
                              <Input
                                value={item.name}
                                onChange={(e) => updateParsed(idx, 'name', e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Unid</Label>
                              <Input
                                value={item.unit}
                                onChange={(e) => updateParsed(idx, 'unit', e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Preço</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.price}
                                onChange={(e) => updateParsed(idx, 'price', parseFloat(e.target.value))}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-1 pt-5">
                            <Badge variant={item.type === 'fixo' ? 'default' : 'secondary'} className="text-xs">
                              {item.type}
                            </Badge>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeParsed(idx)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {match && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Check className="h-3 w-3 text-primary" />
                            Corresponde ao catálogo: {match.name}
                          </p>
                        )}
                      </div>
                    )
                  })}
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
              disabled={saving || !selectedProducerId || !parsed || parsed.length === 0}
            >
              {saving ? 'Salvando...' : 'Salvar Oferta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
