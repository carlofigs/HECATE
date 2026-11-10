import { Banner, Button, Skeleton, VisuallyHidden } from '@hecate/ui'
import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import type { Snapshot } from '../api.ts'
import { useApp } from '../appStore.ts'
import { clockTime } from '../format.ts'
import { describeFailure } from './failure.ts'

/** A page over the open workspace: its heading and every state (R-25, R-26, R-27). design/components/page-shell.md */
export interface PageShellProps {
  title: string
  /** The page this one belongs to, above the heading: "‹ Projects" on a project. */
  back?: { to: string; label: string }
  /** A line under the heading: date, sprint. */
  subtitle?: (snapshot: Snapshot) => ReactNode
  /** Beside the heading: the page's primary action on wider screens. */
  actions?: ReactNode
  /** Gets the snapshot with every pending change applied, as the page should show it. */
  children: (snapshot: Snapshot) => ReactNode
}

export function PageShell({ title, back, subtitle, actions, children }: PageShellProps) {
  const open = useApp(s => s.open)
  const refresh = useApp(s => s.refresh)
  const heading = useRef<HTMLHeadingElement>(null)
  const { pathname } = useLocation()
  const first = useRef(true)

  // After a navigation, move focus to the new page's heading so a screen reader starts there.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    heading.current?.focus()
  }, [pathname])

  const snapshot = open?.snapshot && open.view ? { ...open.snapshot, state: open.view } : (open?.snapshot ?? null)
  const retry = <Button onClick={() => void refresh()}>Try again</Button>

  return (
    <div className="flex flex-col gap-stack-lg">
      <div className="flex flex-wrap items-end justify-between gap-inline-md">
        <div className="flex flex-col gap-stack-xs">
          {back ? (
            <Link to={back.to} className="inline-flex min-h-(--size-target-default) items-center gap-inline-xs self-start text-label text-text-link underline">
              <ChevronLeft aria-hidden="true" className="size-(--size-icon-sm)" />
              {back.label}
            </Link>
          ) : null}
          <h1 ref={heading} tabIndex={-1} className="text-heading-1 text-text-primary">
            {title}
          </h1>
          {snapshot && subtitle ? <div className="text-body-md text-text-secondary">{subtitle(snapshot)}</div> : null}
        </div>
        {snapshot && actions ? actions : null}
      </div>

      {!open || open.status === 'loading' ? (
        <div aria-busy="true" className="flex flex-col gap-stack-lg">
          <VisuallyHidden>Loading…</VisuallyHidden>
          <Skeleton lines={2} />
          <Skeleton lines={4} />
        </div>
      ) : null}

      {open?.status === 'error' && open.failure ? (() => {
        const f = describeFailure(open.failure, `the workspace “${open.dir}”`)
        return (
          <Banner tone="danger" title={f.title} action={f.retry ? retry : undefined}>
            {f.detail}
          </Banner>
        )
      })() : null}

      {snapshot && open?.status === 'stale' && open.failure && open.fetchedAt ? (
        <Banner tone="warning" title={`Showing what HECATE had at ${clockTime(open.fetchedAt)}`} action={retry}>
          {describeFailure(open.failure, 'this workspace').title}. This page updates when HECATE can be reached again.
        </Banner>
      ) : null}

      {snapshot?.lastError ? (
        <Banner tone="warning" title="HECATE reported a problem with the data repository">
          {snapshot.lastError.message} ({clockTime(snapshot.lastError.at)}). Your changes are kept and HECATE keeps retrying.
        </Banner>
      ) : null}

      {snapshot ? children(snapshot) : null}
    </div>
  )
}
