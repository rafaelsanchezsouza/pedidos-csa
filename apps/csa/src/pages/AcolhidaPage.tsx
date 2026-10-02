import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { acolhidaApi, paymentsApi, usersApi } from '@/services/api'
import { useUploadProof } from '@/hooks/useUploadProof'
import type { AcolhidaSemana, Payment } from '@/types'
import {
  getPresentWeekId, getWeekDelivery, formatDeliveryDate, isEntrega,
  PRODUCER_COTA, PRODUCER_FRETE,
} from '@pedidos/core'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, PageHeader } from '@pedidos/core/ui'
import { config } from '@/config'

const mesDe = (weekId: string) => weekId.slice(0, 7)

// Dia da semana da entrega por extenso — o membro pensa em "quarta", não em "02/09".
const diaDaSemanaDaEntrega = (weekId: string) => {
  const [ano, mes, dia] = getWeekDelivery(weekId).split('-').map(Number) as [number, number, number]
  return new Date(ano, mes - 1, dia, 12).toLocaleDateString('pt-BR', { weekday: 'long' })
}

const formatarPrazo = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

/**
 * Um comprovante por fatura da semana. Quem recebe em casa tem DUAS (cota e delivery) e
 * precisa anexar as duas: até aqui a tela só oferecia a da cota, e a fatura de frete —
 * gerada junto, na confirmação da semana — não tinha onde receber comprovante.
 */
function BlocoComprovante({
  fatura, titulo, weekId, enviando, onArquivo,
}: {
  fatura: Payment
  titulo: string
  weekId: string
  enviando: boolean
  onArquivo: (f: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const daSemana = fatura.proofs?.find((p) => p.weekId === weekId)
  const enviados = fatura.proofs?.length ?? 0

  return (
    <section aria-label={titulo} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{titulo}</span>
        {daSemana && <Badge variant="secondary">Enviado</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        Total do mês até agora: <strong>R$ {fatura.amount.toFixed(2)}</strong>
        {enviados > 0 ? ` · ${enviados} comprovante${enviados > 1 ? 's' : ''} enviado${enviados > 1 ? 's' : ''}` : ''}
      </p>
      {daSemana && (
        <a
          href={daSemana.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline block"
        >
          Ver o comprovante desta semana
        </a>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onArquivo(f)
          e.target.value = ''
        }}
      />
      <Button
        variant={daSemana ? 'secondary' : 'default'}
        disabled={enviando}
        onClick={() => fileRef.current?.click()}
      >
        {enviando ? 'Enviando...' : daSemana ? 'Substituir comprovante' : 'Anexar comprovante'}
      </Button>
    </section>
  )
}

/**
 * Tela inicial de quem está em período de acolhida.
 *
 * Duas ações da semana em cima de tudo — confirmar que quer receber e anexar o comprovante —
 * porque são as únicas com prazo. O resto do app continua acessível pelo menu: o membro está
 * decidindo se fica, e esconder ofertas e pedidos dele seria esconder justamente o que ele
 * veio conhecer.
 */
export function AcolhidaPage() {
  const { colmeia, user, refreshUser } = useAuth()
  const tenantId = colmeia?.id
  const weekId = getPresentWeekId(colmeia?.weekChangeDay ?? config.tenantDefaults.weekChangeDay)
  const month = mesDe(weekId)

  const [semana, setSemana] = useState<AcolhidaSemana | null>(null)
  const [cota, setCota] = useState<Payment | null>(null)
  const [frete, setFrete] = useState<Payment | null>(null)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const { uploadProof } = useUploadProof()

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    setErro('')
    try {
      const [s, faturas] = await Promise.all([
        acolhidaApi.getSemana(weekId, tenantId),
        paymentsApi.getMy(month, tenantId),
      ])
      setSemana(s)
      setCota(faturas.find((f) => f.producerName === PRODUCER_COTA) ?? null)
      setFrete(faturas.find((f) => f.producerName === PRODUCER_FRETE) ?? null)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui carregar sua semana')
    } finally {
      setCarregando(false)
    }
  }, [tenantId, weekId, month])

  useEffect(() => { void carregar() }, [carregar])

  async function confirmar(querReceber: boolean) {
    if (!tenantId) return
    setSalvando(true)
    setErro('')
    try {
      await acolhidaApi.confirmar(weekId, querReceber, tenantId)
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui salvar')
    } finally {
      setSalvando(false)
    }
  }

  // O tipo de entrega é campo do MEMBRO (não da semana): trocar aqui é o mesmo que trocar no
  // perfil, e vale daqui para frente.
  async function trocarEntrega(entrega: boolean) {
    if (!tenantId) return
    setSalvando(true)
    setErro('')
    try {
      await usersApi.updateMe({ deliveryType: entrega ? 'entrega' : 'retirada' }, tenantId)
      await refreshUser()
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function enviarComprovante(fatura: Payment, file: File) {
    if (!tenantId || !user) return
    setEnviandoId(fatura.id)
    setErro('')
    try {
      const url = await uploadProof(file, tenantId, user.id, month)
      await paymentsApi.anexarComprovante(fatura.id, weekId, url, tenantId)
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui enviar o comprovante')
    } finally {
      setEnviandoId(null)
    }
  }

  const confirmada = semana?.confirmacao?.confirmado === true
  const respondeu = semana?.confirmacao != null
  const fechado = semana != null && !semana.aberto
  const emCasa = isEntrega(user ?? {})
  // Só quem recebe em casa tem fatura de frete — e ela só existe depois da confirmação.
  const freteDaSemana = emCasa ? frete : null

  if (carregando) return <div className="py-8 text-center text-muted-foreground">Carregando...</div>

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sua semana"
        subtitle={`Entrega de ${diaDaSemanaDaEntrega(weekId)}, ${formatDeliveryDate(weekId)}`}
      />

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Desejo receber esta semana</span>
            {respondeu && (
              <Badge variant={confirmada ? 'default' : 'secondary'}>
                {confirmada ? 'Confirmado' : 'Não vou receber'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={confirmada ? 'default' : 'secondary'}
              disabled={salvando || fechado}
              onClick={() => void confirmar(true)}
            >
              Quero receber
            </Button>
            <Button
              className="flex-1"
              variant={respondeu && !confirmada ? 'default' : 'secondary'}
              disabled={salvando || fechado}
              onClick={() => void confirmar(false)}
            >
              Esta semana não
            </Button>
          </div>
          {semana && (
            <p className="text-sm text-muted-foreground">
              {fechado
                ? 'O prazo desta semana encerrou. Fale com a organização se precisar mudar.'
                : `Você pode confirmar até ${formatarPrazo(semana.prazo)}.`}
            </p>
          )}
          {!respondeu && !fechado && (
            <p className="text-sm text-muted-foreground">
              Sem confirmar, sua cesta não entra no pedido da semana — e nada é cobrado.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Como você recebe</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={!emCasa ? 'default' : 'secondary'}
              disabled={salvando}
              onClick={() => void trocarEntrega(false)}
            >
              {config.vocabulary.pickupLabel}
            </Button>
            <Button
              className="flex-1"
              variant={emCasa ? 'default' : 'secondary'}
              disabled={salvando}
              onClick={() => void trocarEntrega(true)}
            >
              Entrega em casa
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Vale a partir de agora. Entrega em casa tem frete por semana recebida.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {freteDaSemana ? 'Comprovantes desta semana' : 'Comprovante desta semana'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cota || freteDaSemana ? (
            <>
              {cota && (
                <BlocoComprovante
                  fatura={cota}
                  titulo={config.tenantDefaults.quotaTerm}
                  weekId={weekId}
                  enviando={enviandoId === cota.id}
                  onArquivo={(f) => void enviarComprovante(cota, f)}
                />
              )}
              {freteDaSemana && (
                <BlocoComprovante
                  fatura={freteDaSemana}
                  titulo={config.vocabulary.deliveryFeeLabel}
                  weekId={weekId}
                  enviando={enviandoId === freteDaSemana.id}
                  onArquivo={(f) => void enviarComprovante(freteDaSemana, f)}
                />
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Confirme a semana para gerar o valor a pagar.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AcolhidaPage
