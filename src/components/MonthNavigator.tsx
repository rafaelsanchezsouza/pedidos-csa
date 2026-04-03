import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 1 mês à frente até 11 meses atrás (13 opções)
function monthOptions(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let delta = 1; delta >= -11; delta--) {
    const d = new Date(now.getFullYear(), now.getMonth() + delta, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function formatMonth(month: string): string {
  return new Date(month + '-01T12:00:00').toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
}

export function MonthNavigator({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const options = monthOptions()
  const atMin = month <= options[options.length - 1]
  const atMax = month >= options[0]

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(shiftMonth(month, -1))}
        disabled={atMin}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <select
        value={month}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-2 py-1 text-sm capitalize"
      >
        {options.map((m) => (
          <option key={m} value={m}>{formatMonth(m)}</option>
        ))}
      </select>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={atMax}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
