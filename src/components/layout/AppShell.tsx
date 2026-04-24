import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  Focus,
  Kanban,
  FolderKanban,
  CalendarDays,
  Archive,
  Brain,
  Sun,
  Moon,
  Settings,
  MoreHorizontal,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SyncStatus } from '@/components/layout/SyncStatus'
import { useSettings } from '@/hooks/useSettings'
import { useDataStore } from '@/store/useDataStore'

const NAV_ITEMS = [
  { to: '/focus',    label: 'Focus',    Icon: Focus        },
  { to: '/tasks',    label: 'Tasks',    Icon: Kanban       },
  { to: '/projects', label: 'Projects', Icon: FolderKanban },
  { to: '/weeklog',  label: 'Week Log', Icon: CalendarDays },
  { to: '/archive',  label: 'Archive',  Icon: Archive      },
  { to: '/memory',   label: 'Memory',   Icon: Brain        },
] as const

// Top 5 shown in bottom nav; rest behind "More"
const BOTTOM_NAV_PRIMARY = NAV_ITEMS.slice(0, 5)

// Items that overflow into "More" on mobile
const MORE_ITEMS = NAV_ITEMS.slice(5)

export default function AppShell() {
  const navigate  = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const { settings, updateSettings, saveSettings } = useSettings()
  const { saveFile, tasks, focus, projects, weekly_log, archive, memory } = useDataStore()

  // Redirect to setup if no credentials
  useEffect(() => {
    const creds = localStorage.getItem('hecate:credentials')
    if (!creds) navigate('/setup', { replace: true })
  }, [navigate])

  // Cmd+S / Ctrl+S — immediately flush all dirty files
  useEffect(() => {
    async function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const dirty = (
          [['tasks', tasks], ['focus', focus], ['projects', projects],
           ['weekly_log', weekly_log], ['archive', archive], ['memory', memory]] as const
        ).filter(([, s]) => s.dirty).map(([name]) => name)
        await Promise.all(dirty.map(name => saveFile(name)))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tasks.dirty, focus.dirty, projects.dirty, weekly_log.dirty, archive.dirty, memory.dirty]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTheme() {
    const next = settings.theme === 'dark' ? 'light' : 'dark'
    updateSettings(d => { d.theme = next })
    saveSettings()
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">

      {/* ── Sidebar (desktop ≥1024px) ─────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-52 border-r border-border bg-card shrink-0">

        {/* Logo / wordmark */}
        <div className="px-4 py-4 border-b border-border">
          <span className="font-mono text-xs tracking-[0.25em] text-primary font-medium uppercase">
            HECATE
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer — sync status + actions */}
        <div className="px-3 py-3 border-t border-border space-y-2">
          {/* Sync status */}
          <div className="px-1">
            <SyncStatus />
          </div>

          <div className="space-y-0.5">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Sun className="w-4 h-4 hidden dark:block shrink-0" />
              <Moon className="w-4 h-4 dark:hidden shrink-0" />
              <span className="dark:hidden">Light mode</span>
              <span className="hidden dark:inline">Dark mode</span>
            </button>
            <button
              onClick={() => navigate('/setup')}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Settings className="w-4 h-4 shrink-0" />
              Settings
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content area ──────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tracking-[0.25em] text-primary font-medium uppercase">
              HECATE
            </span>
            {/* Compact sync dot on mobile */}
            <SyncStatus compact />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Toggle theme"
            >
              <Sun className="w-4 h-4 hidden dark:block" />
              <Moon className="w-4 h-4 dark:hidden" />
            </button>
            <button
              onClick={() => navigate('/setup')}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>

        {/* ── Bottom nav (mobile <1024px) ──────────────────────────────── */}
        <nav className="lg:hidden flex items-stretch border-t border-border bg-card shrink-0 pb-[env(safe-area-inset-bottom)]">
          {BOTTOM_NAV_PRIMARY.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}

          {/* "More" — overflow nav items */}
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors',
              moreOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span>More</span>
          </button>
        </nav>

        {/* More overlay */}
        {moreOpen && (
          <>
            {/* Backdrop */}
            <div
              className="absolute inset-0 z-40"
              onClick={() => setMoreOpen(false)}
            />
            {/* Sheet */}
            <div className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] right-0 left-0 z-50 bg-card border-t border-border shadow-lg">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <span className="text-xs font-medium text-muted-foreground">More</span>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {MORE_ITEMS.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-4 py-3 text-sm transition-colors',
                      isActive ? 'text-primary font-medium' : 'text-foreground hover:bg-accent',
                    )
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
