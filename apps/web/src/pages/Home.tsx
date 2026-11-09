import { EmptyState, Skeleton, VisuallyHidden } from '@hecate/ui'
import { Navigate } from 'react-router'
import { useApp } from '../appStore.ts'
import { pickWorkspace, rememberedWorkspace } from '../workspace.ts'
import { Problem } from './Problem.tsx'

/** `/`: open the workspace you used last, the default, or the first one. */
export function Home() {
  const workspaces = useApp(s => s.workspaces)
  const start = useApp(s => s.start)
  if (workspaces.status === 'loading') {
    return (
      <main id="main" aria-busy="true" className="mx-auto w-full max-w-app p-inset-lg">
        <VisuallyHidden>Loading your workspaces…</VisuallyHidden>
        <Skeleton lines={3} />
      </main>
    )
  }
  if (workspaces.status === 'error') return <Problem failure={workspaces.failure} what="your workspaces" onRetry={() => void start()} />
  const dir = pickWorkspace(workspaces.list, rememberedWorkspace())
  if (dir) return <Navigate to={`/w/${encodeURIComponent(dir)}/today`} replace />
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-prose flex-col justify-center gap-stack-md bg-bg-canvas p-inset-lg">
      <h1 className="text-heading-1 text-text-primary">HECATE</h1>
      <EmptyState title="No workspaces yet">
        The data repository has no workspace directories. Run the migration, or create a workspace there, then come back.
      </EmptyState>
    </main>
  )
}
