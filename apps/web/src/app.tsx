import { Skeleton, VisuallyHidden } from '@hecate/ui'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { appStore, useApp } from './appStore.ts'
import { Board } from './board/Board.tsx'
import { Home } from './pages/Home.tsx'
import { NotFound } from './pages/NotFound.tsx'
import { Problem } from './pages/Problem.tsx'
import { SignIn } from './pages/SignIn.tsx'
import { Today } from './pages/Today.tsx'
import { Shell } from './shell/Shell.tsx'

/** Everything behind sign-in. The session is the Worker's httpOnly cookie; the app only asks who it belongs to. */
function Gate() {
  const session = useApp(s => s.session)
  useEffect(() => {
    void appStore.getState().start()
  }, [])
  switch (session.status) {
    case 'checking':
      return (
        <main id="main" aria-busy="true" className="mx-auto w-full max-w-app p-inset-lg">
          <VisuallyHidden>Checking who is signed in…</VisuallyHidden>
          <Skeleton lines={3} />
        </main>
      )
    case 'signed-out':
      return <SignIn />
    case 'error':
      return <Problem failure={session.failure} what="your session" onRetry={() => void appStore.getState().start()} />
    case 'signed-in':
      return <Outlet />
  }
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Gate />}>
          <Route index element={<Home />} />
          <Route path="w/:workspace" element={<Shell />}>
            <Route index element={<Navigate to="today" replace />} />
            <Route path="today" element={<Today />} />
            <Route path="board" element={<Board />} />
            <Route path="*" element={<Navigate to="today" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
