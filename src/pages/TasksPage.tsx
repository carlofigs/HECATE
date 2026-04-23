import { useDataFile } from '@/hooks/useDataFile'
import { PageShell } from '@/components/layout/PageShell'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { Skeleton } from '@/components/ui/skeleton'

const BoardSkeleton = (
  <div className="flex gap-3 p-4 h-full overflow-hidden">
    {[4, 7, 2, 1].map((n, i) => (
      <div key={i} className="flex flex-col w-72 shrink-0 gap-2">
        <Skeleton className="h-9 w-full rounded-lg" />
        {Array.from({ length: n }).map((_, j) => (
          <Skeleton key={j} className="h-14 w-full rounded-md" />
        ))}
      </div>
    ))}
  </div>
)

export default function TasksPage() {
  const { data, loading, error, setData, reload } = useDataFile('tasks')

  return (
    <PageShell
      loading={loading}
      error={error}
      onRetry={reload}
      skeleton={BoardSkeleton}
    >
      {data && <TaskBoard data={data} setData={setData} />}
    </PageShell>
  )
}
