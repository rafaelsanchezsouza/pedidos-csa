import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Wand2, Check, X, History, Pencil, Lock, Unlock, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { offeringsApi, producersApi, productsApi, tenantsApi } from '@/services/api'
import { formatDeliveryDate, getPresentWeekId, melhorMatch } from '@pedidos/core'
import { PageHeader, WeekNavigator } from '@pedidos/core/ui'
import type { WeeklyOffering, Producer, Product, ParsedProduct, OfferingItem } from '@/types'
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea, Label, Input, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pedidos/core/ui'

// Vínculo com o catálogo: item já existente (id) ou produto novo (criado ao salvar).
const NOVO_PRODUTO = '__novo__'

// `vinculoManual` é estado só da tela: quando o operador escolhe o vínculo na mão, a
// reconferência automática para — senão a tela desfaz a escolha dele.
type ItemOferta = ParsedProduct & { vinculoManual?: boolean }

// Memoizado de propósito: a lista inteira re-renderizava a cada tecla (cada item carrega um
// Select com o catálogo), e digitar ficava travado. Com props estáveis — `catalogo` vem de
// useMemo e os callbacks de useCallback — só o cartão editado re-renderiza.
const CartaoItem = memo(function CartaoItem({
  idx, item, catalogo, onCampo, onReconferir, onVincular, onRemover,
}: {
  idx: number
  item: ItemOferta
  catalogo: Product[]
  onCampo: (idx: number, campo: 'name' | 'unit' | 'price', valor: string | number) => void
  onReconferir: (idx: number) => void
  onVincular: (idx: number, valor: string) => void
  onRemover: (idx: number) => void
}) {
  const vinculo = catalogo.find((p) => p.id === item.matchedProductId)
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 grid grid-cols-4 gap-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input
              value={item.name}
              onChange={(e) => onCampo(idx, 'name', e.target.value)}
              // Reconferir no blur (e não a cada tecla): o vínculo muda uma vez, quando o
              // nome está pronto.
              onBlur={() => onReconferir(idx)}
              placeholder="Nome do produto"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unid</Label>
            <Input
              value={item.unit}
              onChange={(e) => onCampo(idx, 'unit', e.target.value)}
              placeholder="unid"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preço</Label>
            <Input
              type="number"
              step="0.01"
              value={item.price}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                onCampo(idx, 'price', Number.isFinite(v) ? v : 0)
              }}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-1 pt-5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemover(idx)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {vinculo
          ? <Check className="h-3 w-3 shrink-0 text-primary" />
          : <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <Select value={vinculo?.id ?? NOVO_PRODUTO} onValueChange={(v) => onVincular(idx, v)}>
          <SelectTrigger
            className="h-7 text-xs"
            aria-label={`Vínculo com o catálogo: ${item.name || 'produto sem nome'}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOVO_PRODUTO}>Produto novo — será criado no catálogo</SelectItem>
            {catalogo.map((p) => (
              <SelectItem key={p.id} value={p.id}>Catálogo: {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
})

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
  const [parsed, setParsed] = useState<ItemOferta[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallingBack, setFallingBack] = useState<string | null>(null)
  const [fallbackMessage, setFallbackMessage] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<WeeklyOffering | null>(null)
  const [extrasAberto, setExtrasAberto] = useState<boolean>(true)
  const [togglingExtras, setTogglingExtras] = useState(false)

  const [weekId, setWeekId] = useState(getPresentWeekId())

  // O servidor casa a mensagem contra o catálogo DO produtor; a tela usa o mesmo recorte.
  // useMemo para o cartão memoizado não re-renderizar por causa de um array novo a cada tecla.
  const catalogo = useMemo(
    () => products.filter((p) => p.producerId === selectedProducerId),
    [products, selectedProducerId]
  )
  const itens = parsed ?? []
  const semNome = itens.some((i) => !i.name.trim())

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    try {
      const [offs, prods, prdsrs, freshColmeia] = await Promise.all([
        offeringsApi.list(weekId, colmeia.id),
        producersApi.list(colmeia.id),
        productsApi.list(colmeia.id),
        tenantsApi.get(colmeia.id),
      ])
      setOfferings(offs)
      setProducers(prods)
      setProducts(prdsrs)
      setExtrasAberto(freshColmeia.extrasAberto ?? true)
    } catch {
      // silencioso — erros de carregamento não são exibidos ao usuário aqui
    } finally {
      setLoading(false)
    }
  }, [colmeia, weekId])

  useEffect(() => { load() }, [load])

  async function handleToggleExtras() {
    if (!colmeia) return
    setTogglingExtras(true)
    try {
      const novo = !extrasAberto
      await tenantsApi.update(colmeia.id, { extrasAberto: novo })
      setExtrasAberto(novo)
    } finally {
      setTogglingExtras(false)
    }
  }

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
    if (!colmeia || !rawMessage.trim() || !selectedProducerId) return
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

  const alterarCampo = useCallback(
    (idx: number, campo: 'name' | 'unit' | 'price', valor: string | number) => {
      setParsed((prev) => prev && prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)))
    },
    []
  )

  // Reconfere o vínculo de um item contra o catálogo (mesma regra do servidor). Chamada no
  // blur do nome, não a cada tecla. Casou → o catálogo preenche o que a mensagem não trouxe
  // (preço 0, unidade vazia); o que ela trouxe manda. Vínculo escolhido à mão fica de fora.
  const reconferir = useCallback((idx: number) => {
    setParsed((prev) => prev && prev.map((it, i) => {
      if (i !== idx || it.vinculoManual) return it
      const match = melhorMatch(it.name, catalogo)
      if (match) {
        return {
          ...it,
          matchedProductId: match.id,
          price: it.price > 0 ? it.price : match.price,
          unit: it.unit || match.unit,
        }
      }
      const { matchedProductId: _semVinculo, ...resto } = it
      return resto
    }))
  }, [catalogo])

  const vincular = useCallback((idx: number, valor: string) => {
    setParsed((prev) => prev && prev.map((it, i) => {
      if (i !== idx) return it
      if (valor === NOVO_PRODUTO) {
        const { matchedProductId: _semVinculo, ...resto } = it
        return { ...resto, vinculoManual: true }
      }
      const produto = catalogo.find((p) => p.id === valor)
      return {
        ...it,
        matchedProductId: valor,
        vinculoManual: true,
        ...(produto
          ? {
              name: produto.name,
              unit: it.unit || produto.unit,
              price: it.price > 0 ? it.price : produto.price,
            }
          : {}),
      }
    }))
  }, [catalogo])

  // Trocar de produtor troca o catálogo: os vínculos antigos apontam para o catálogo errado,
  // então a lista é reconferida contra o novo (inclusive os escolhidos à mão).
  function trocarProdutor(id: string) {
    setSelectedProducerId(id)
    if (!parsed) return
    const novoCatalogo = products.filter((p) => p.producerId === id)
    setParsed(parsed.map(({ vinculoManual: _manual, ...item }) => {
      const match = melhorMatch(item.name, novoCatalogo)
      return match
        ? {
            ...item,
            matchedProductId: match.id,
            price: item.price > 0 ? item.price : match.price,
            unit: item.unit || match.unit,
          }
        : { ...item, matchedProductId: undefined }
    }))
  }

  // Produto que não veio na mensagem: entra na lista sem re-gerar (regerar apaga as edições).
  function adicionarItem() {
    const tipo = itens[itens.length - 1]?.type ?? 'extra'
    setParsed([...itens, { name: '', unit: '', price: 0, type: tipo }])
  }

  const removeParsed = useCallback((idx: number) => {
    setParsed((prev) => prev && prev.filter((_, i) => i !== idx))
  }, [])

  async function handleSave() {
    if (!colmeia || !selectedProducerId || !parsed) return
    setError(null)
    setSaving(true)
    try {
      const producer = producers.find((p) => p.id === selectedProducerId)
      const items: OfferingItem[] = parsed.map((p) => ({
        productId: p.matchedProductId || crypto.randomUUID(),
        productName: p.name.trim(),
        unit: p.unit.trim(),
        price: p.price,
        type: p.type,
      }))
      if (editing) {
        await offeringsApi.update(editing.id, { items, rawMessage }, colmeia.id)
      } else {
        await offeringsApi.create({
          producerId: selectedProducerId,
          producerName: producer?.name ?? '',
          tenantId: colmeia.id,
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
              <Select value={selectedProducerId} onValueChange={trocarProdutor} disabled={!!editing}>
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
                disabled={parsing || !rawMessage.trim() || !selectedProducerId}
                className="w-full"
              >
                <Wand2 className="mr-2" />
                {parsing
                  ? 'Gerando...'
                  : itens.length > 0 ? 'Gerar de novo (substitui a lista)' : 'Gerar Oferta'}
              </Button>
            </div>

            {selectedProducerId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Produtos da oferta ({itens.length})</Label>
                  <Button variant="outline" size="sm" onClick={adicionarItem}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar produto
                  </Button>
                </div>
                {itens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Cole a mensagem e gere a oferta, ou adicione os produtos à mão.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {itens.map((item, idx) => (
                      <CartaoItem
                        key={idx}
                        idx={idx}
                        item={item}
                        catalogo={catalogo}
                        onCampo={alterarCampo}
                        onReconferir={reconferir}
                        onVincular={vincular}
                        onRemover={removeParsed}
                      />
                    ))}
                  </div>
                )}
                {semNome && (
                  <p className="text-xs text-destructive">Todo produto precisa de um nome.</p>
                )}
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
              disabled={saving || !selectedProducerId || itens.length === 0 || semNome}
            >
              {saving ? 'Salvando...' : 'Salvar Oferta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
