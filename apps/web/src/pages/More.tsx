import { Link, useParams } from 'react-router'
import { PageShell } from '../shell/PageShell.tsx'
import { IN_BAR, PAGES } from '../shell/pages.ts'

/** The pages the phone's bottom bar has no room for, as links with what each is for. design/components/app-shell.md */
export function More() {
  const { workspace = '' } = useParams()
  const base = `/w/${encodeURIComponent(workspace)}`
  return (
    <PageShell title="More">
      {() => (
        <nav aria-label="More pages">
          <ul className="flex flex-col gap-stack-sm">
            {PAGES.slice(IN_BAR).map(({ path, label, icon: Icon, description }) => (
              <li key={path}>
                <Link
                  to={`${base}/${path}`}
                  className="flex min-h-(--size-target-default) items-center gap-inline-md rounded-container border border-border-subtle bg-bg-surface p-inset-md no-underline hover:bg-bg-surface-hover"
                >
                  <Icon aria-hidden="true" className="size-(--size-icon-lg) shrink-0 text-text-secondary" />
                  <span className="flex flex-col gap-stack-xs">
                    <span className="text-heading-4 text-text-link underline">{label}</span>
                    <span className="text-body-sm text-text-secondary">{description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </PageShell>
  )
}
