import { memo } from 'react'
import { isActive } from '../api/gitlab'
import type { EffectiveStatus } from '../types/gitlab'

function SummaryCardsBase({ projectCount, statuses }: { projectCount: number; statuses: EffectiveStatus[] }) {
  const count = (s: string) => statuses.filter((x) => x === s).length
  const cards: [string, number, string][] = [
    ['Total Projects', projectCount, 'text-slate-100'],
    ['Active', statuses.filter((s) => isActive({ status: s })).length, 'text-sky-400'],
    ['Running', count('running'), 'text-blue-400'],
    ['Pending', count('pending'), 'text-amber-400'],
    ['Failed', count('failed'), 'text-red-400'],
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map(([label, value, color]) => (
        <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
          <div className={`mt-1 text-3xl font-semibold ${color}`}>{value}</div>
        </div>
      ))}
    </div>
  )
}

export const SummaryCards = memo(SummaryCardsBase)
