import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

export default function AppShell() {
  const navigate = useNavigate()

  // Redirect to setup if no token
  useEffect(() => {
    const creds = localStorage.getItem('hecate:credentials')
    if (!creds) navigate('/setup', { replace: true })
  }, [navigate])

  // Apply theme from localStorage
  useEffect(() => {
    const settings = localStorage.getItem('hecate:ui')
    if (settings) {
      try {
        const { theme } = JSON.parse(settings)
        if (theme === 'light') {
          document.documentElement.classList.remove('dark')
        } else {
          document.documentElement.classList.add('dark')
        }
      } catch {
        document.documentElement.classList.add('dark')
      }
    }
  }, [])

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark')
    if (isDark) {
      document.documentElement.classList.remove('dark')
      saveUIPreference('light')
    } else {
      document.documentElement.classList.add('dark')
      saveUIPreference('dark')
    }
  }

  function saveUIPreference(theme: 'dark' | 'light') {
    const current = localStorage.getItem('hecate:ui')
    const ui = current ? JSON.parse(current) : {}
    localStorage.setItem('hecate:ui', JSON.stringify({ ...ui, theme }))
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

        {/* Footer actions */}
        <div className="px-2 py-3 border-t border-border space-y-0.5">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Sun className="w-4 h-4 hidden dark:block" />
            <Moon className="w-4 h-4 dark:hidden" />
            <span className="dark:hidden">Light mode</span>
            <span className="hidden dark:inline">Dark mode</span>
          </button>
          <button
            onClick={() => navigate('/setup')}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </aside>

      {/* ── Main content area ──────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
          <span className="font-mono text-xs tracking-[0.25em] text-primary font-medium uppercase">
            HECATE
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Sun className="w-4 h-4 hidden dark:block" />
              <Moon className="w-4 h-4 dark:hidden" />
            </button>
            <button
              onClick={() => navigate('/setup')}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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

          {/* "More" menu — Archive + Memory */}
          <button className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <MoreHorizontal className="w-5 h-5" />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
