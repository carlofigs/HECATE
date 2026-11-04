import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import AppShell from '@/components/layout/AppShell'
import { PageErrorBoundary } from '@/components/layout/PageErrorBoundary'

// ─── Lazy page imports — each becomes its own JS chunk ────────────────────────
// Initial load only fetches the shell + the active route's chunk.

const FocusPage    = lazy(() => import('@/pages/FocusPage'))
const TasksPage    = lazy(() => import('@/pages/TasksPage'))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'))
const WeekLogPage  = lazy(() => import('@/pages/WeekLogPage'))
const ArchivePage  = lazy(() => import('@/pages/ArchivePage'))
const MemoryPage   = lazy(() => import('@/pages/MemoryPage'))
const SetupPage    = lazy(() => import('@/pages/SetupPage'))

// ─── Minimal loading fallback ─────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  )
}

// ─── Route table ──────────────────────────────────────────────────────────────

const SHELL_ROUTES = [
  { path: '/focus',    Page: FocusPage    },
  { path: '/tasks',    Page: TasksPage    },
  { path: '/projects', Page: ProjectsPage },
  { path: '/weeklog',  Page: WeekLogPage  },
  { path: '/archive',  Page: ArchivePage  },
  { path: '/memory',   Page: MemoryPage   },
] as const

export default function App() {
  return (
    <TooltipProvider delayDuration={250}>
      <HashRouter>
        <Routes>
          {/* Setup — shown before credentials exist */}
          <Route
            path="/setup"
            element={
              <Suspense fallback={<PageLoader />}>
                <SetupPage />
              </Suspense>
            }
          />

          {/* Main app — each page independently error-bounded and code-split */}
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/focus" replace />} />
            {SHELL_ROUTES.map(({ path, Page }) => (
              <Route
                key={path}
                path={path}
                element={
                  <PageErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                      <Page />
                    </Suspense>
                  </PageErrorBoundary>
                }
              />
            ))}
          </Route>

          <Route path="*" element={<Navigate to="/focus" replace />} />
        </Routes>

        {/* Global toast notifications */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: { toast: 'font-sans text-sm' },
          }}
        />
      </HashRouter>
    </TooltipProvider>
  )
}
