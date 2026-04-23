import { PageShell } from '@/components/layout/PageShell'
import { useDataFile } from '@/hooks/useDataFile'

export default function TasksPage() {
  const { data, loading, error, reload } = useDataFile('tasks')

  return (
    <PageShell loading={loading} error={error} onRetry={reload} title="Tasks">
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        {data ? 'Tasks board — coming in Session 5' : null}
      </div>
    </PageShell>
  )
}
