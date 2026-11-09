import { IconButton, SelectField, Toaster, cn } from '@hecate/ui'
import { CalendarDays, KanbanSquare, LogOut } from 'lucide-react'
import { useEffect, type MouseEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { appStore, useApp } from '../appStore.ts'
import { dismissToast, useToasts } from '../toasts.ts'
import { workspaceLabel } from '../workspace.ts'
import { Mark } from './Mark.tsx'
import { setBottomActionSlot } from './slots.ts'
import { SyncStatus } from './SyncStatus.tsx'

/** How often an open, visible page checks for changes made elsewhere (live updates arrive in P6). */
const REFRESH_MS = 60_000
/** Focus, visibility and reconnecting each ask for a refresh; one is enough within this window. */
const MIN_AGE_MS = 5_000

const navClass = ({ isActive }: { isActive: boolean }): string =>
  cn(
    'inline-flex items-center gap-inline-xs min-h-(--size-target-default) px-inline-sm text-label border-b-(length:--border-width-md)',
    isActive ? 'border-accent-text text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary',
  )

/** The pages. One list for both placements: the header from `md`, the bottom bar below it (M-app-02, M-app-07). */
function MainNav({ workspace, className }: { workspace: string; className?: string }) {
  const base = `/w/${encodeURIComponent(workspace)}`
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex items-center gap-inline-xs">
        <li>
          <NavLink to={`${base}/today`} className={navClass}>
            <CalendarDays aria-hidden="true" className="size-(--size-icon-md)" />
            Today
          </NavLink>
        </li>
        <li>
          <NavLink to={`${base}/board`} className={navClass}>
            <KanbanSquare aria-hidden="true" className="size-(--size-icon-md)" />
            Board
          </NavLink>
        </li>
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

  useEffect(() => {
    void appStore.getState().openWorkspace(workspace)
  }, [workspace])

  useEffect(() => {
    const check = (): void => {
      if (document.visibilityState === 'visible') void appStore.getState().refreshIfStale(MIN_AGE_MS)
    }
    const timer = setInterval(check, REFRESH_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', check)
    }
  }, [])

  const list = workspaces.status === 'ready' ? workspaces.list.workspaces.filter(w => !w.hidden || w.dir === workspace) : []
  const options = list.some(w => w.dir === workspace) ? list : [...list, { dir: workspace, name: null }]
  const page = pathname.split('/').at(-1) ?? 'today'

  return (
    <div className="flex min-h-dvh flex-col bg-bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-inset-md focus:top-inset-md focus:z-(--z-toast) focus:rounded-control focus:bg-bg-raised focus:p-inset-md focus:text-label focus:shadow-overlay">
        Skip to content
      </a>
      <header className="sticky top-0 z-(--z-sticky) border-b border-border-subtle bg-bg-surface">
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
      <main id="main" tabIndex={-1} onClick={inAppLinks} className="mx-auto w-full max-w-app flex-1 px-inline-lg py-stack-lg lg:px-inline-xl">
        <Outlet />
      </main>
      <div className="sticky bottom-0 z-(--z-sticky) flex items-center justify-between gap-inline-sm border-t border-border-subtle bg-bg-surface px-inline-md py-stack-xs md:hidden">
        <MainNav workspace={workspace} />
        <div ref={setBottomActionSlot} />
      </div>
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
