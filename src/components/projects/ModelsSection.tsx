/**
 * ModelsSection — collapsible dbt-models table for a project.
 */

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Model } from '@/lib/schemas'

const LAYER_ORDER   = ['staging', 'intermediate', 'mart']
const LAYER_COLOUR: Record<string, string> = {
  staging:      'text-sky-500/70 bg-sky-500/10',
  intermediate: 'text-violet-500/70 bg-violet-500/10',
  mart:         'text-emerald-500/70 bg-emerald-500/10',
}

export function ModelsSection({ models }: { models: Model[] }) {
  const [collapsed, setCollapsed] = useState(true)
  const sorted = [...models].sort(
    (a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer),
  )

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-muted/20 transition-colors"
      >
        <ChevronDown className={cn('w-3 h-3 text-emerald-500/70 transition-transform duration-150 shrink-0', collapsed && '-rotate-90')} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500/70 flex-1 text-left">
          dbt Models
        </span>
        <span className="text-[10px] text-muted-foreground/50">{models.length}</span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/5">
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[200px]">Model</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[90px]">Layer</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Dev</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Prod</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[80px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {sorted.map(m => (
                <tr key={m.name} className="hover:bg-muted/10 transition-colors">
                  <td className="px-3 py-2 font-mono text-[11px] text-foreground/80">{m.name}</td>
                  <td className="px-3 py-2">
                    <span className={cn('text-[10px] font-medium rounded px-1.5 py-0.5', LAYER_COLOUR[m.layer] ?? 'text-muted-foreground bg-muted/50')}>
                      {m.layer}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground font-mono">{m.materialisationDev}</td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground font-mono">{m.materialisationProd}</td>
                  <td className="px-3 py-2">
                    <span className={cn('text-[10px] font-medium', m.status === 'Done' ? 'text-green-500' : 'text-amber-500')}>
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
