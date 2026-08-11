import { useState, FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { MessageCircle, ArrowLeft } from 'lucide-react'
import { signInWithCustomToken } from 'firebase/auth'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/services/firebase'
import { whatsappApi } from '@/services/api'
import { BRAND } from '@/lib/brand'
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pedidos/core/ui'

function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ''
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function isPhoneInput(value: string): boolean {
  return /^\d/.test(value.replace(/[()\s-]/g, ''))
}

export function LoginPage() {
  const { firebaseUser, tenant, tenants, loading, authError, login, selectTenant } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // OTP flow
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpSubmitting, setOtpSubmitting] = useState(false)

  const isPhone = isPhoneInput(identifier) && identifier.length > 0
  const displayError = error || authError

  if (!loading && firebaseUser && tenant) {
    return <Navigate to="/pedidos" replace />
  }

  function handleIdentifierChange(value: string) {
    const firstMeaningful = value.replace(/[()\s-]/g, '')[0]
    if (firstMeaningful && /\d/.test(firstMeaningful)) {
      setIdentifier(applyPhoneMask(value))
    } else {
      setIdentifier(value)
    }
    setError('')
    setOtpSent(false)
    setOtp('')
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(identifier, password)
    } catch {
      setError('E-mail ou senha inválidos.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestOtp() {
    setError('')
    setOtpSubmitting(true)
    try {
      await whatsappApi.requestOtp(identifier)
      setOtpSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar código')
    } finally {
      setOtpSubmitting(false)
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    setError('')
    setOtpSubmitting(true)
    try {
      const { customToken } = await whatsappApi.verifyOtp(identifier, otp)
      await signInWithCustomToken(auth, customToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido ou expirado')
    } finally {
      setOtpSubmitting(false)
    }
  }

  if (firebaseUser && tenants.length > 1 && !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <img src={BRAND.icon} alt="" className="h-12 w-12 object-contain" />
            </div>
            <CardTitle>Selecionar Organização</CardTitle>
            <CardDescription>Você pertence a mais de uma organização</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select onValueChange={selectTenant}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha uma organização..." />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src={BRAND.icon} alt="" className="h-16 w-16 object-contain" />
          </div>
          <CardTitle className="text-2xl">{BRAND.name}</CardTitle>
          <CardDescription>{BRAND.tagline}</CardDescription>
        </CardHeader>
        <CardContent>
          {otpSent ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageCircle className="h-4 w-4 text-green-600 shrink-0" />
                <span>Código enviado para seu WhatsApp</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="otp">Código de acesso</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError('') }}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              {displayError && <p className="text-sm text-destructive">{displayError}</p>}
              <Button type="submit" className="w-full" disabled={otpSubmitting || otp.length < 6}>
                {otpSubmitting ? 'Verificando...' : 'Verificar'}
              </Button>
              <button
                type="button"
                onClick={() => { setOtpSent(false); setOtp(''); setError('') }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-full justify-center"
              >
                <ArrowLeft className="h-3 w-3" />
                Voltar
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">E-mail ou celular</Label>
                <Input
                  id="identifier"
                  type="text"
                  inputMode={isPhone ? 'tel' : 'email'}
                  value={identifier}
                  onChange={(e) => handleIdentifierChange(e.target.value)}
                  placeholder="seu@email.com ou (11) 99999-9999"
                  autoComplete={isPhone ? 'tel' : 'email'}
                />
              </div>

              {isPhone ? (
                <>
                  {displayError && <p className="text-sm text-destructive">{displayError}</p>}
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleRequestOtp}
                    disabled={otpSubmitting}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {otpSubmitting ? 'Enviando...' : 'Acesso sem senha'}
                  </Button>
                </>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError('') }}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  {displayError && <p className="text-sm text-destructive">{displayError}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Entrando...' : 'Entrar'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={handleRequestOtp}
                    disabled={!identifier || otpSubmitting}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {otpSubmitting ? 'Enviando...' : 'Acesso sem senha'}
                  </Button>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
