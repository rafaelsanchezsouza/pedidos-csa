import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { issuesApi } from '@/services/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export function ReportarProblema() {
  const { user, colmeia } = useAuth()
  const location = useLocation()

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successUrl, setSuccessUrl] = useState('')

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setTitle('')
      setDescription('')
      setError('')
      setSuccessUrl('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const body = [
        description.trim(),
        '',
        '---',
        `**Usuário:** ${user?.name ?? user?.email ?? 'desconhecido'}`,
        `**Colmeia:** ${colmeia?.name ?? 'nenhuma'}`,
        `**Página:** ${location.pathname}`,
      ].join('\n')

      const result = await issuesApi.create({ title: title.trim(), body })
      setSuccessUrl(result.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar problema')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <AlertCircle className="h-4 w-4" />
        Reportar Problema
      </button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reportar Problema</DialogTitle>
          <DialogDescription>
            Descreva o problema encontrado. Uma issue será criada automaticamente.
          </DialogDescription>
        </DialogHeader>

        {successUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Problema reportado com sucesso!{' '}
              <a
                href={successUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Ver issue no GitHub
              </a>
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="issue-title">Título</Label>
              <Input
                id="issue-title"
                placeholder="Ex: Botão de pedido não funciona"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issue-description">Descrição</Label>
              <Textarea
                id="issue-description"
                placeholder="Descreva o que aconteceu e como reproduzir o problema..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={submitting}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !title.trim()}>
                {submitting ? 'Enviando...' : 'Enviar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
