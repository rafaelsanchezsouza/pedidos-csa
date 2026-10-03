import { useState, useRef } from 'react'
import { paymentsApi } from '@/services/api'
import { useUploadProof } from '@/hooks/useUploadProof'
import type { Payment } from '@/types'
import { formatDeliveryDate } from '@pedidos/core'
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Label,
} from '@pedidos/core/ui'

const brl = (v: number) => `R$ ${v.toFixed(2)}`
const temComprovante = (p: Payment) => !!(p.proofUrl || p.proofs?.length)

/**
 * Correção de uma fatura pelo admin: valor (com motivo e histórico) e troca do comprovante.
 *
 * Vale para QUALQUER fatura — cota, frete ou produtor —, por isso vive aqui e não dentro de
 * uma tela: o motor nunca distinguiu (`POST /payments/:id/correcao` não olha o producerName,
 * e tanto `upsertGenerated` quanto `upsertPaymentsForOrder` respeitam o `corrigido`).
 */
export function DialogEdicaoFatura({
  payment, gerado, tenantId, month, onFechar, onSalvo,
}: {
  payment: Payment
  /** Como o valor automático foi composto, quando a tela souber dizer (ex.: "R$ 12 × 3"). */
  gerado?: string
  tenantId: string
  month: string
  onFechar: () => void
  onSalvo: () => Promise<void>
}) {
  const [valor, setValor] = useState(payment.amount.toFixed(2))
  const [motivo, setMotivo] = useState('')
  const [semana, setSemana] = useState(payment.proofs?.[0]?.weekId ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { uploadProof } = useUploadProof()

  const comGuarda = async (fn: () => Promise<void>) => {
    setSalvando(true)
    setErro('')
    try {
      await fn()
      await onSalvo()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar')
    } finally {
      setSalvando(false)
    }
  }

  const salvarValor = () =>
    comGuarda(async () => {
      const n = Number(valor.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) throw new Error('Valor inválido')
      await paymentsApi.corrigirValor(payment.id, n, motivo.trim(), tenantId)
      onFechar()
    })

  const desfazer = () =>
    comGuarda(async () => {
      await paymentsApi.desfazerCorrecao(payment.id, tenantId)
      onFechar()
    })

  // O arquivo vai para a pasta do MEMBRO (payment.userId), não a do admin: é o comprovante
  // dele, e é onde as outras telas procuram.
  const trocarComprovante = (file: File) =>
    comGuarda(async () => {
      const url = await uploadProof(file, tenantId, payment.userId, month)
      if (payment.proofs?.length) {
        await paymentsApi.anexarComprovante(payment.id, semana, url, tenantId)
      } else {
        await paymentsApi.update(payment.id, { proofUrl: url }, tenantId)
      }
      onFechar()
    })

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onFechar() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{payment.userName}</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="valor">Valor da fatura (R$)</Label>
            <Input
              id="valor" type="number" step="0.01" min="0" inputMode="decimal"
              value={valor} onChange={(e) => setValor(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {payment.corrigido
                ? `Gerado automaticamente: ${brl(payment.amountOriginal ?? payment.amount)}`
                : gerado ?? `Gerado automaticamente: ${brl(payment.amount)}`}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo (opcional)</Label>
            <Input
              id="motivo" value={motivo} placeholder="ex.: entrega não saiu na semana 2"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label>Comprovante</Label>
            {payment.proofs && payment.proofs.length > 1 && (
              <select
                aria-label="Semana a substituir"
                className="border rounded px-2 py-1 text-sm bg-background w-full"
                value={semana}
                onChange={(e) => setSemana(e.target.value)}
              >
                {payment.proofs.map((pr) => (
                  <option key={pr.weekId} value={pr.weekId}>
                    Semana de {formatDeliveryDate(pr.weekId)}
                  </option>
                ))}
              </select>
            )}
            <input
              ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void trocarComprovante(f) }}
            />
            <Button variant="secondary" size="sm" disabled={salvando} onClick={() => fileRef.current?.click()}>
              {temComprovante(payment) ? 'Substituir comprovante' : 'Anexar comprovante'}
            </Button>
          </div>

          {payment.correcoes && payment.correcoes.length > 0 && (
            <div className="border-t pt-3 space-y-1">
              <Label>Histórico</Label>
              {payment.correcoes.map((c, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {brl(c.de)} → {brl(c.para)} · {new Date(c.em).toLocaleDateString('pt-BR')}
                  {c.motivo ? ` · ${c.motivo}` : ''}
                </p>
              ))}
            </div>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter className="gap-2">
          {payment.corrigido && (
            <Button variant="outline" size="sm" disabled={salvando} onClick={() => void desfazer()}>
              Desfazer correção
            </Button>
          )}
          <Button size="sm" disabled={salvando} onClick={() => void salvarValor()}>
            {salvando ? 'Salvando...' : 'Salvar valor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
