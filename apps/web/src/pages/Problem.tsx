import { Banner, Button } from '@hecate/ui'
import type { Failure } from '../api.ts'
import { describeFailure } from '../shell/failure.ts'

/** A whole-page failure before any workspace is open: who you are, or which workspaces exist. */
export function Problem({ failure, what, onRetry }: { failure: Failure; what: string; onRetry: () => void }) {
  const f = describeFailure(failure, what)
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-prose flex-col justify-center gap-stack-md bg-bg-canvas p-inset-lg">
      <h1 className="text-heading-1 text-text-primary">HECATE</h1>
      <Banner tone="danger" title={f.title} action={f.retry ? <Button onClick={onRetry}>Try again</Button> : undefined}>
        {f.detail}
      </Banner>
    </main>
  )
}
