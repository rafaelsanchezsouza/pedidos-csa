import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { acolhidaApi, paymentsApi, usersApi } from '@/services/api'
import { useUploadProof } from '@/hooks/useUploadProof'
import type { AcolhidaSemana, Payment } from '@/types'
import { getPresentWeekId, getWeekDelivery, formatDeliveryDate, isEntrega } from '@pedidos/core'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, PageHeader } from '@pedidos/core/ui'
import { config } from '@/config'

const mesDe = (weekId: string) => weekId.slice(0, 7)

const formatarPrazo = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

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
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
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
      setCota(faturas.find((f) => f.producerName === 'Cota') ?? null)
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

  async function enviarComprovante(file: File) {
    if (!tenantId || !user || !cota) return
    setSalvando(true)
    setErro('')
    try {
      const url = await uploadProof(file, tenantId, user.id, month)
      await paymentsApi.anexarComprovante(cota.id, weekId, url, tenantId)
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui enviar o comprovante')
    } finally {
      setSalvando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmada = semana?.confirmacao?.confirmado === true
  const respondeu = semana?.confirmacao != null
  const fechado = semana != null && !semana.aberto
  const comprovanteDaSemana = cota?.proofs?.find((p) => p.weekId === weekId)
  const emCasa = isEntrega(user ?? {})

  if (carregando) return <div className="py-8 text-center text-muted-foreground">Carregando...</div>

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sua semana"
        subtitle={`Entrega de ${formatDeliveryDate(weekId)} · ${getWeekDelivery(weekId).split('-').reverse().join('/')}`}
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
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Comprovante desta semana</span>
            {comprovanteDaSemana && <Badge variant="secondary">Enviado</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cota ? (
            <>
              <p className="text-sm text-muted-foreground">
                Total do mês até agora: <strong>R$ {cota.amount.toFixed(2)}</strong>
                {cota.proofs?.length ? ` · ${cota.proofs.length} comprovante(s) enviado(s)` : ''}
              </p>
              {comprovanteDaSemana && (
                <a
                  href={comprovanteDaSemana.url}
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
                  if (f) void enviarComprovante(f)
                }}
              />
              <Button
                variant={comprovanteDaSemana ? 'secondary' : 'default'}
                disabled={salvando}
                onClick={() => fileRef.current?.click()}
              >
                {salvando ? 'Enviando...' : comprovanteDaSemana ? 'Substituir comprovante' : 'Anexar comprovante'}
              </Button>
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
