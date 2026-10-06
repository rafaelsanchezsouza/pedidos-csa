import { useState } from 'react'
import { statusLabel, statusVariant } from '../domain/index.js'
import { Badge } from './primitives/badge.js'
import { Button } from './primitives/button.js'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './primitives/dialog.js'
import type { FaturaComComprovantes } from './Comprovantes.js'

export interface FaturaComStatus extends FaturaComComprovantes {
  verified?: boolean
}

/**
 * Badge de status da fatura. Com `podeAlterar` (admin), dois atalhos que passam por uma
 * confirmação:
 * - `Pendente` → `Verificado`: dar baixa em pagamento **sem comprovante** (dinheiro, Pix sem
 *   print). É confirmar dinheiro sem evidência, por isso nunca é um clique só.
 * - `Verificado` → volta: o desfazer do clique errado.
 * `Aguardando verificação` não é atalho — tem comprovante, e o botão `Verificar` da tela já
 * é o caminho normal.
 *
 * O rastro de quem fez é do servidor (coleção `auditoria`), não deste componente.
 */
export function StatusFatura({
  payment,
  podeAlterar = false,
  descricao,
  onAlterar,
}: {
  payment: FaturaComStatus
  podeAlterar?: boolean
  /** Identifica a fatura no dialog — ex.: "Ana · Cota · R$ 65,00 · 2026-09". */
  descricao: string
  onAlterar: (verified: boolean) => Promise<void>
}) {
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const badge = <Badge variant={statusVariant(payment)}>{statusLabel(payment)}</Badge>
  const temComprovante = !!(payment.proofUrl || payment.proofs?.length)
  const atalho = podeAlterar && (payment.verified || !temComprovante)
  if (!atalho) return badge

  const desfazer = !!payment.verified
  async function confirmar() {
    setSalvando(true)
    setErro('')
    try {
      await onAlterar(!desfazer)
      setAberto(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="cursor-pointer"
        title={desfazer ? 'Desfazer verificação' : 'Marcar como pago sem comprovante'}
        onClick={() => { setErro(''); setAberto(true) }}
      >
        {badge}
      </button>
      <Dialog open={aberto} onOpenChange={(a) => { if (!salvando) setAberto(a) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {desfazer ? 'Desfazer a verificação?' : 'Marcar como pago sem comprovante?'}
            </DialogTitle>
            <DialogDescription>
              {desfazer
                ? 'A fatura volta a constar como não verificada.'
                : 'Use só para pagamento confirmado por fora (dinheiro, Pix sem comprovante).'}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">{descricao}</p>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" disabled={salvando} onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={salvando} onClick={() => void confirmar()}>
              {salvando ? '...' : desfazer ? 'Desfazer' : 'Marcar como verificado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
