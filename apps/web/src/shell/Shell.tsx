import { Banner, IconButton, SelectField, Toaster, cn } from '@hecate/ui'
import { CalendarDays, FolderOpen, KanbanSquare, LogOut, type LucideIcon } from 'lucide-react'
import { useEffect, type MouseEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { appStore, useApp } from '../appStore.ts'
import { dismissToast, useToasts } from '../toasts.ts'
import { useOnline } from '../useOnline.ts'
import { workspaceLabel } from '../workspace.ts'
import { Mark } from './Mark.tsx'
import { setBottomActionSlot } from './slots.ts'
import { SyncStatus } from './SyncStatus.tsx'
import { UpdateBanner } from './UpdateBanner.tsx'
import { reloadToUpdate, useNeedRefresh } from './updates.ts'

/** How often an open, visible page checks for changes made elsewhere (live updates arrive in P6). */
const REFRESH_MS = 60_000
/** Focus, visibility and reconnecting each ask for a refresh; one is enough within this window. */
const MIN_AGE_MS = 5_000

/** The pages, in order. Three fit the phone's bottom bar beside a page's action; a fourth makes the last slot "More" (app-shell.md). */
const PAGES: readonly { path: string; label: string; icon: LucideIcon }[] = [
  { path: 'today', label: 'Today', icon: CalendarDays },
  { path: 'board', label: 'Board', icon: KanbanSquare },
  { path: 'projects', label: 'Projects', icon: FolderOpen },
]

const navClass = (compact: boolean) => ({ isActive }: { isActive: boolean }): string =>
  cn(
    'inline-flex items-center min-h-(--size-target-default) border-b-(length:--border-width-md)',
    // In the bottom bar each page is an icon over a short label, so the pages and the page's action fit at 320 px.
    compact ? 'min-w-(--size-target-default) flex-col justify-center text-caption' : 'gap-inline-xs px-inline-sm text-label',
    isActive ? 'border-accent-text text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary',
  )

/** The pages. One list for both placements: the header from `md`, the bottom bar below it (M-app-02, M-app-07). */
function MainNav({ workspace, compact = false, className }: { workspace: string; compact?: boolean; className?: string }) {
  const base = `/w/${encodeURIComponent(workspace)}`
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex items-center gap-inline-xs">
        {PAGES.map(({ path, label, icon: Icon }) => (
          <li key={path}>
            <NavLink to={`${base}/${path}`} className={navClass(compact)}>
              <Icon aria-hidden="true" className="size-(--size-icon-md)" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Same-origin links inside the page (task keys in Markdown and chips) navigate in the app instead of reloading it. */
function useInAppLinks(): (event: MouseEvent) => void {
  const navigate = useNavigate()
  return event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as Element).closest('a')
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/w/')) return
    event.preventDefault()
    void navigate(`${url.pathname}${url.search}`)
  }
}

/** The app around a workspace: header, navigation, sync status and the page. design/components/app-shell.md */
export function Shell() {
  const { workspace = '' } = useParams()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const workspaces = useApp(s => s.workspaces)
  const open = useApp(s => s.open)
  const signOut = useApp(s => s.signOut)
  const toasts = useToasts()
  const inAppLinks = useInAppLinks()
  const online = useOnline()
  const needRefresh = useNeedRefresh()
  const unsent = useApp(s => (s.open?.queue.length ?? 0) > 0)

  // Never lose input (M-app-06): changes not yet sent live in this tab, so ask before it closes or reloads.
  useEffect(() => {
    if (!unsent) return
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsent])

  useEffect(() => {
    void appStore.getState().openWorkspace(workspace)
  }, [workspace])

  useEffect(() => {
    const check = (): void => {
      if (document.visibilityState === 'visible') void appStore.getState().refreshIfStale(MIN_AGE_MS)
    }
    // Back online: send what is waiting now, not after the backoff, and catch up.
    const reconnect = (): void => {
      appStore.getState().retryNow()
      check()
    }
    const timer = setInterval(check, REFRESH_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('online', reconnect)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', reconnect)
    }
  }, [])

  const list = workspaces.status === 'ready' ? workspaces.list.workspaces.filter(w => !w.hidden || w.dir === workspace) : []
  const options = list.some(w => w.dir === workspace) ? list : [...list, { dir: workspace, name: null }]
  // The section to keep when switching workspace: /w/<dir>/projects/<slug> keeps Projects, not the slug.
  const page = pathname.split('/')[3] ?? 'today'

  return (
    // An app layout: only the page scrolls, between the header and the bottom bar, so nothing on it can ever sit under
    // either (R-07 targets, 2.4.11 focus not obscured).
    <div className="flex h-dvh flex-col bg-bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-inset-md focus:top-inset-md focus:z-(--z-toast) focus:rounded-control focus:bg-bg-raised focus:p-inset-md focus:text-label focus:shadow-overlay">
        Skip to content
      </a>
      <header className="shrink-0 border-b border-border-subtle bg-bg-surface">
        <div className="mx-auto flex w-full max-w-app flex-wrap items-center gap-x-inline-lg gap-y-stack-xs px-inline-lg py-stack-xs lg:px-inline-xl">
          <Link to="/" className="flex min-h-(--size-target-default) items-center gap-inline-sm text-heading-4 text-text-primary no-underline">
            <Mark className="size-(--size-icon-lg)" />
            HECATE
          </Link>
          <MainNav workspace={workspace} className="max-md:hidden" />
          <div className="ms-auto flex flex-wrap items-center gap-x-inline-md gap-y-stack-xs">
            <SyncStatus open={open} />
            <SelectField
              inline
              label="Workspace"
              value={workspace}
              options={options.map(w => ({ value: w.dir, label: workspaceLabel(w) }))}
              onChange={e => void navigate(`/w/${encodeURIComponent(e.target.value)}/${page}`)}
            />
            <IconButton label="Sign out" icon={<LogOut aria-hidden="true" className="size-(--size-icon-md)" />} onClick={() => void signOut()} />
          </div>
        </div>
      </header>
      {/* Links are clicks on <a> elements; the handler only routes them, so it is not an interaction of its own. */}
      <main id="main" tabIndex={-1} onClick={inAppLinks} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-app flex-col gap-stack-md px-inline-lg py-stack-lg lg:px-inline-xl">
          {needRefresh ? <UpdateBanner onReload={reloadToUpdate} /> : null}
          {online ? null : (
            <Banner tone="warning" title="You're offline">
              HECATE shows what it had when the connection dropped. Changes you make are kept and saved when you reconnect; keep this tab open until they are.
            </Banner>
          )}
          <Outlet />
        </div>
      </main>
      <div className="flex shrink-0 items-center justify-between gap-inline-sm border-t border-border-subtle bg-bg-surface px-inline-md py-stack-xs md:hidden">
        <MainNav workspace={workspace} compact />
        <div ref={setBottomActionSlot} />
      </div>
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
