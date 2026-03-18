import { useState, useEffect, useCallback } from 'react'
import { Plus, Sparkles, Check, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { offeringsApi, producersApi, productsApi } from '@/services/api'
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

function getWeekStart(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export function OfertasPage() {
  const { colmeia } = useAuth()
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

  const weekId = getWeekStart()

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
    } finally {
      setLoading(false)
    }
  }, [colmeia, weekId])

  useEffect(() => { load() }, [load])

  function openDialog() {
    setSelectedProducerId('')
    setRawMessage('')
    setParsed(null)
    setDialogOpen(true)
  }

  async function handleParse() {
    if (!colmeia || !rawMessage.trim()) return
    setParsing(true)
    try {
      const result = await offeringsApi.parse(rawMessage, colmeia.id)
      setParsed(result)
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
      await offeringsApi.create({
        producerId: selectedProducerId,
        producerName: producer?.name ?? '',
        colmeiaId: colmeia.id,
        items,
        weekStart: weekId,
        rawMessage,
      }, colmeia.id)
      setDialogOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ofertas da Semana</h1>
          <p className="text-muted-foreground text-sm">Semana de {weekId}</p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="mr-2" /> Nova Oferta
        </Button>
      </div>

      {offerings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma oferta cadastrada para esta semana.
          </CardContent>
        </Card>
      ) : (
        offerings.map((off) => (
          <Card key={off.id}>
            <CardHeader>
              <CardTitle className="text-lg">{off.producerName}</CardTitle>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Oferta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Produtor</Label>
              <Select value={selectedProducerId} onValueChange={setSelectedProducerId}>
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
                <Sparkles className="mr-2" />
                {parsing ? 'Analisando com IA...' : 'Analisar com IA'}
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
