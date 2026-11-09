import { Banner } from '@hecate/ui'
import type { Ref } from 'react'

/** A form's problems, listed after a submit; focused so the person hears them first (R-27). */
export function FormProblems({ problems, ref }: { problems: readonly string[]; ref: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} tabIndex={-1}>
      <Banner tone="danger" title={`Fix ${problems.length === 1 ? 'this' : `these ${problems.length} things`} before saving`}>
        <ul className="flex list-disc flex-col gap-stack-xs ps-inline-lg">
          {problems.map(p => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Banner>
    </div>
  )
}
