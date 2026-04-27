import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
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
  Command,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SyncStatus } from '@/components/layout/SyncStatus'
import { StaleDataBanner } from '@/components/layout/StaleDataBanner'
import { useSettings } from '@/hooks/useSettings'
import { useStaleDetector } from '@/hooks/useStaleDetector'
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

// ─── Keyboard shortcuts overlay ───────────────────────────────────────────────

const SHORTCUT_SECTIONS = [
  {
    heading: 'Navigation (press G, then…)',
    rows: [
      ['G  F', 'Focus'],
      ['G  T', 'Tasks'],
      ['G  P', 'Projects'],
      ['G  W', 'Week Log'],
      ['G  A', 'Archive'],
      ['G  M', 'Memory'],
    ],
  },
  {
    heading: 'Tasks',
    rows: [
      ['N', 'New task (in first active column)'],
    ],
  },
  {
    heading: 'Global',
    rows: [
      ['⌘ S  /  Ctrl S', 'Save all dirty files immediately'],
      ['?', 'Toggle this shortcuts overlay'],
    ],
  },
]

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Command className="w-3.5 h-3.5 text-muted-foreground/60" />
              <span className="text-xs font-semibold text-foreground">Keyboard shortcuts</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Shortcut sections */}
          <div className="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto">
            {SHORTCUT_SECTIONS.map(sec => (
              <div key={sec.heading}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2">
                  {sec.heading}
                </p>
                <div className="space-y-1">
                  {sec.rows.map(([keys, desc]) => (
                    <div key={keys} className="flex items-center justify-between gap-4">
                      <span className="text-[11px] text-muted-foreground">{desc}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {keys.split(/\s{2,}/).map(k => (
                          <kbd
                            key={k}
                            className="px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono text-foreground"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2.5 border-t border-border">
            <p className="text-[10px] text-muted-foreground/40">Press <kbd className="px-1 rounded border border-border bg-muted text-[9px] font-mono">?</kbd> or <kbd className="px-1 rounded border border-border bg-muted text-[9px] font-mono">Esc</kbd> to close</p>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Nav key → route mapping ──────────────────────────────────────────────────

const G_NAV: Record<string, string> = {
  f: '/focus', t: '/tasks', p: '/projects',
  w: '/weeklog', a: '/archive', m: '/memory',
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AppShell() {
  const navigate  = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const gMode   = useRef(false)
  const gTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { settings, updateSettings, saveSettings } = useSettings()
  const { staleFiles, reloadStale, dismiss: dismissStale } = useStaleDetector()

  // Targeted selectors — each subscription is isolated to a single boolean so AppShell
  // only re-renders when that specific dirty flag changes, not on any store write.
  const saveFile      = useDataStore(s => s.saveFile)
  const tasksDirty    = useDataStore(s => s.tasks.dirty)
  const focusDirty    = useDataStore(s => s.focus.dirty)
  const projectsDirty = useDataStore(s => s.projects.dirty)
  const weekLogDirty  = useDataStore(s => s.weekly_log.dirty)
  const archiveDirty  = useDataStore(s => s.archive.dirty)
  const memoryDirty   = useDataStore(s => s.memory.dirty)

  // Redirect to setup if no credentials
  useEffect(() => {
    const creds = localStorage.getItem('hecate:credentials')
    if (!creds) navigate('/setup', { replace: true })
  }, [navigate])

  // Global keyboard shortcuts
  useEffect(() => {
    // Build the dirty-file list at event time using the closure over reactive booleans
    const dirtyMap: Array<[import('@/lib/schemas').DataFileName, boolean]> = [
      ['tasks',      tasksDirty],
      ['focus',      focusDirty],
      ['projects',   projectsDirty],
      ['weekly_log', weekLogDirty],
      ['archive',    archiveDirty],
      ['memory',     memoryDirty],
    ]

    async function onKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable

      // Cmd+S / Ctrl+S — save all dirty files (allowed even while typing)
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const toSave = dirtyMap.filter(([, dirty]) => dirty).map(([name]) => name)
        await Promise.all(toSave.map(name => saveFile(name)))
        return
      }

      if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return

      // ? — toggle shortcuts overlay
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen(v => !v)
        return
      }

      // G-prefix navigation: press G, then a letter within 1.5s
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault()
        gMode.current = true
        if (gTimer.current) clearTimeout(gTimer.current)
        gTimer.current = setTimeout(() => { gMode.current = false }, 1500)
        return
      }

      if (gMode.current) {
        const dest = G_NAV[e.key.toLowerCase()]
        if (dest) {
          e.preventDefault()
          gMode.current = false
          if (gTimer.current) clearTimeout(gTimer.current)
          navigate(dest)
        }
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, saveFile, tasksDirty, focusDirty, projectsDirty, weekLogDirty, archiveDirty, memoryDirty])

  const toggleTheme = useCallback(async () => {
    const next = settings.theme === 'dark' ? 'light' : 'dark'
    updateSettings(d => { d.theme = next })
    try {
      await saveSettings()
    } catch {
      toast.error('Failed to save theme preference')
    }
  }, [settings.theme, updateSettings, saveSettings])

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
            <button
              onClick={() => setShortcutsOpen(true)}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Command className="w-4 h-4 shrink-0" />
              Shortcuts
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

        {/* Stale data banner — shown when remote changes are detected */}
        <StaleDataBanner
          staleFiles={staleFiles}
          onReload={reloadStale}
          onDismiss={dismissStale}
        />

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

      {/* ── Keyboard shortcuts overlay ───────────────────────────────── */}
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </div>
  )
}
