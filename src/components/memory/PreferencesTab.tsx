import { Prose } from './memoryShared'

export function PreferencesTab({
  preferences,
  productivitySystem,
}: {
  preferences:        string
  productivitySystem: string
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2">
            Working Preferences
          </h2>
          <div className="rounded-lg border border-border bg-card p-3">
            <Prose content={preferences} />
          </div>
        </section>
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2">
            Productivity System
          </h2>
          <div className="rounded-lg border border-border bg-card p-3">
            <Prose content={productivitySystem} />
          </div>
        </section>
      </div>
    </div>
  )
}
