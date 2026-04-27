/**
 * SprintVelocityChart — SVG bar chart of completed tasks per archived sprint.
 *
 * Pure SVG, no external charting library.
 * Sorted oldest → newest left to right.
 * Hovering a bar shows a tooltip with the exact count and date.
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ArchiveWeek } from '@/lib/schemas'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtWeek(weekOf: string): string {
  const d = new Date(weekOf + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// ─── Chart constants ──────────────────────────────────────────────────────────

const H        = 80   // bar area height (px)
const LABEL_H  = 18   // x-axis label height
const PAD_L    = 28   // left padding (y-axis numbers)
const PAD_R    = 8
const PAD_TOP  = 8
const TOTAL_H  = H + LABEL_H + PAD_TOP

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  weeks: ArchiveWeek[]
  className?: string
}

export function SprintVelocityChart({ weeks, className }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)

  // Sort oldest → newest
  const sorted = [...weeks].sort((a, b) => a.weekOf.localeCompare(b.weekOf))
  const data   = sorted.map(w => ({ weekOf: w.weekOf, done: w.done.length }))
  const maxVal = Math.max(...data.map(d => d.done), 1)

  if (data.length === 0) return null

  return (
    <div className={cn('select-none', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2">
        Sprint velocity — tasks done
      </p>

      {/* Responsive SVG wrapper */}
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 400 ${TOTAL_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full"
          style={{ height: TOTAL_H }}
        >
          {/* Y-axis reference lines + labels */}
          {[0, 0.5, 1].map(frac => {
            const y = PAD_TOP + H - frac * H
            const val = Math.round(frac * maxVal)
            return (
              <g key={frac}>
                <line
                  x1={PAD_L} y1={y} x2={400 - PAD_R} y2={y}
                  stroke="currentColor"
                  strokeOpacity={frac === 0 ? 0.15 : 0.07}
                  strokeWidth={1}
                  strokeDasharray={frac === 0 ? undefined : '3 3'}
                  className="text-muted-foreground"
                />
                <text
                  x={PAD_L - 4} y={y + 3}
                  textAnchor="end"
                  fontSize={8}
                  fill="currentColor"
                  fillOpacity={0.3}
                  className="text-muted-foreground"
                >
                  {val}
                </text>
              </g>
            )
          })}

          {/* Bars */}
          {(() => {
            const barW    = (400 - PAD_L - PAD_R) / data.length
            const barPad  = Math.min(barW * 0.25, 10)
            const bw      = barW - barPad * 2

            return data.map((d, i) => {
              const x       = PAD_L + i * barW + barPad
              const barH    = (d.done / maxVal) * H
              const y       = PAD_TOP + H - barH
              const isHov   = hovered === i
              const labelY  = PAD_TOP + H + LABEL_H - 2

              return (
                <g key={d.weekOf}
                   onMouseEnter={() => setHovered(i)}
                   onMouseLeave={() => setHovered(null)}
                   style={{ cursor: 'default' }}
                >
                  {/* Bar */}
                  <rect
                    x={x} y={y} width={bw} height={Math.max(barH, 2)}
                    rx={2}
                    fill="currentColor"
                    fillOpacity={isHov ? 0.8 : 0.45}
                    className="text-green-500 transition-all duration-100"
                  />

                  {/* Value label above bar — always visible when small dataset */}
                  {(data.length <= 8 || isHov) && barH > 12 && (
                    <text
                      x={x + bw / 2} y={y - 3}
                      textAnchor="middle"
                      fontSize={8}
                      fill="currentColor"
                      fillOpacity={isHov ? 0.9 : 0.5}
                      className="text-foreground transition-opacity"
                    >
                      {d.done}
                    </text>
                  )}

                  {/* X-axis label */}
                  <text
                    x={x + bw / 2} y={labelY}
                    textAnchor="middle"
                    fontSize={7.5}
                    fill="currentColor"
                    fillOpacity={isHov ? 0.7 : 0.35}
                    className="text-muted-foreground"
                  >
                    {fmtWeek(d.weekOf)}
                  </text>

                  {/* Hover tooltip */}
                  {isHov && (
                    <g>
                      <rect
                        x={Math.min(x + bw / 2 - 28, 400 - PAD_R - 58)} y={y - 28}
                        width={56} height={18}
                        rx={3}
                        fill="currentColor"
                        fillOpacity={0.9}
                        className="text-card"
                      />
                      <text
                        x={Math.min(x + bw / 2, 400 - PAD_R - 30)} y={y - 16}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={600}
                        fill="currentColor"
                        fillOpacity={0.95}
                        className="text-foreground"
                      >
                        {d.done} done  WB {fmtWeek(d.weekOf)}
                      </text>
                    </g>
                  )}
                </g>
              )
            })
          })()}
        </svg>
      </div>
    </div>
  )
}
