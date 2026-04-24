import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import AppShell from '@/components/layout/AppShell'
import FocusPage from '@/pages/FocusPage'
import TasksPage from '@/pages/TasksPage'
import ProjectsPage from '@/pages/ProjectsPage'
import WeekLogPage from '@/pages/WeekLogPage'
import ArchivePage from '@/pages/ArchivePage'
import MemoryPage from '@/pages/MemoryPage'
import SetupPage from '@/pages/SetupPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Setup — shown when no valid token exists */}
        <Route path="/setup" element={<SetupPage />} />

        {/* Main app — wrapped in the shell */}
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/focus" replace />} />
          <Route path="/focus"    element={<FocusPage />} />
          <Route path="/tasks"    element={<TasksPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/weeklog"  element={<WeekLogPage />} />
          <Route path="/archive"  element={<ArchivePage />} />
          <Route path="/memory"   element={<MemoryPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/focus" replace />} />
      </Routes>

      {/* Global toast notifications */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: 'font-sans text-sm',
          },
        }}
      />
    </HashRouter>
  )
}
