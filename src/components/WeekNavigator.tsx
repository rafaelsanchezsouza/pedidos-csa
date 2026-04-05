import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getPresentWeekId, shiftWeek, formatDeliveryDate, weekOptions } from '@/lib/weekUtils'

interface WeekNavigatorProps {
  weekId: string
  onChange: (weekId: string) => void
  maxWeekId?: string
}

export function WeekNavigator({ weekId, onChange, maxWeekId }: WeekNavigatorProps) {
  const max = maxWeekId ?? getPresentWeekId()
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange(shiftWeek(weekId, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <select
        value={weekId}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      >
        {weekOptions().map((w) => (
          <option key={w} value={w}>{formatDeliveryDate(w)}</option>
        ))}
      </select>
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange(shiftWeek(weekId, 1))} disabled={weekId >= max}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
