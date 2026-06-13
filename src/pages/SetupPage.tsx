/**
 * SetupPage — GitHub credentials + app settings.
 *
 * Two modes:
 *   First-run: minimal centred credentials form (no data loaded yet)
 *   Settings:  full page — preferences, column types, credentials
 *
 * The individual controls live in src/components/setup/.
 */

import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { CREDENTIALS_STORAGE_KEY } from '@/lib/taskConstants'
import { Section } from '@/components/setup/setupShared'
import {
  OneOnOnePeopleSection,
  DefaultViewSection,
  AutoSaveSection,
  PollIntervalSection,
  ColumnTypesSection,
} from '@/components/setup/SettingsSections'
import { CredentialsSection } from '@/components/setup/CredentialsSection'

export default function SetupPage() {
  const navigate   = useNavigate()
  const isFirstRun = !localStorage.getItem(CREDENTIALS_STORAGE_KEY)

  // First-run: minimal centred credentials form
  if (isFirstRun) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center">
            <p className="font-mono text-xs tracking-[0.3em] text-primary uppercase">HECATE</p>
            <h1 className="text-xl font-semibold text-foreground">Connect your repository</h1>
            <p className="text-sm text-muted-foreground">
              A fine-grained GitHub PAT with <em>Contents</em> read/write access on your data repo.
            </p>
          </div>
          <CredentialsSection isFirstRun />
        </div>
      </div>
    )
  }

  // Settings mode
  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-8">

          <Section
            title="1:1 People"
            description="Names that appear as dedicated prep sections when generating a week log. Press Enter or click Add."
          >
            <OneOnOnePeopleSection />
          </Section>

          <div className="border-t border-border" />

          <Section
            title="Tasks Default View"
            description="Which view the Tasks page opens in. Overrideable per-session from the Tasks header."
          >
            <DefaultViewSection />
          </Section>

          <div className="border-t border-border" />

          <Section
            title="Auto-save Debounce"
            description="How long HECATE waits after your last edit before writing to GitHub."
          >
            <AutoSaveSection />
          </Section>

          <div className="border-t border-border" />

          <Section
            title="Sync Polling"
            description="Background check for changes made outside HECATE (e.g. by Claude or direct edits). Shows a reload banner when remote changes are detected."
          >
            <PollIntervalSection />
          </Section>

          <div className="border-t border-border" />

          <Section
            title="Column Types"
            description="Assign each Kanban column a semantic role. Used by Archive and Week Log to identify which tasks to snapshot."
          >
            <ColumnTypesSection />
          </Section>

          <div className="border-t border-border" />

          <Section
            title="GitHub Credentials"
            description={<>Fine-grained PAT with <em>Contents</em> read/write on your data repo. Stored in <code className="font-mono text-[11px]">localStorage</code> — never sent anywhere except GitHub.</>}
          >
            <CredentialsSection isFirstRun={false} />
          </Section>

        </div>
      </div>
    </div>
  )
}
