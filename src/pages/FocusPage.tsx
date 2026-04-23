import { PageShell } from '@/components/layout/PageShell'
import { useDataFile } from '@/hooks/useDataFile'

export default function FocusPage() {
  const { data, loading, error, reload } = useDataFile('focus')

  return (
    <PageShell loading={loading} error={error} onRetry={reload} title="Focus">
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        {data ? 'Focus view — coming in Session 4' : null}
      </div>
    </PageShell>
  )
}
