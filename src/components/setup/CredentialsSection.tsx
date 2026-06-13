/**
 * CredentialsSection — two-phase GitHub connection flow.
 *
 *   Phase 1 — enter token / owner / repo → "Verify & load workspaces"
 *             Calls the GitHub Contents API to list root-level directories.
 *   Phase 2 — pick workspace from dropdown → "Save & connect" / "Update"
 *             Stores full credentials to localStorage.
 *
 * Editing the repo fields resets back to phase 1 so the workspace list stays fresh.
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WORKSPACES_STORAGE_KEY, CREDENTIALS_STORAGE_KEY, PENDING_TOAST_KEY } from '@/lib/taskConstants'
import { readStoredCredentials } from './setupShared'

export function CredentialsSection({ isFirstRun }: { isFirstRun: boolean }) {
  const navigate = useNavigate()

  const stored = readStoredCredentials()

  // Phase 1 fields
  const [token, setToken] = useState(() => stored?.token ?? '')
  const [owner, setOwner] = useState(() => stored?.owner ?? '')
  const [repo,  setRepo]  = useState(() => stored?.repo  ?? '')

  // Phase 2 state
  // Workspace list: initialise from localStorage cache so the dropdown is populated
  // immediately on revisit without needing to re-verify.
  const [workspaces, setWorkspaces] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(WORKSPACES_STORAGE_KEY) ?? '[]') } catch { return [] }
  })
  const [workspace,     setWorkspace]     = useState(() => stored?.workspace ?? '')
  const [verifiedCreds, setVerifiedCreds] = useState<{ token: string; owner: string; repo: string } | null>(
    stored ? { token: stored.token, owner: stored.owner, repo: stored.repo } : null,
  )
  const [loading, setLoading] = useState(false)

  // Monotonically-increasing counter used to detect stale verify responses.
  // If the user edits a field while a verify is in flight, the counter increments
  // and the in-flight response is discarded before it can commit stale credentials.
  const verifyReqId = useRef(0)

  // On mount: if we're already in phase 2 but the workspace cache is empty, re-fetch silently.
  // Runs in useEffect (not component body) to be safe with React 19 concurrent rendering.
  useEffect(() => {
    if (!stored || workspaces.length > 0) return
    let aborted = false
    setLoading(true)
    doFetchWorkspaces(stored.token, stored.owner, stored.repo, stored.workspace, () => aborted)
      .catch(err => {
        if (!aborted) toast.error(`Could not load workspaces: ${(err as Error).message ?? 'Network error'}`)
      })
      .finally(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Snap workspace selection to a valid value when the cached list no longer contains the
  // stored workspace (e.g. user renamed/deleted a directory in GitHub between sessions).
  // Without this, <select value={workspace}> has no matching <option> and the browser
  // silently displays the first option while React state still holds the old value.
  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.includes(workspace)) {
      setWorkspace(workspaces[0])
    }
  }, [workspaces, workspace])

  // After a Settings-mode save, handleSave writes a toast message to sessionStorage
  // before calling window.location.reload() — the toast cannot survive page teardown.
  // On remount we read that key, fire the toast, and immediately clear it so it only
  // appears once and cannot leak across subsequent page loads.
  useEffect(() => {
    const msg = sessionStorage.getItem(PENDING_TOAST_KEY)
    if (msg) {
      sessionStorage.removeItem(PENDING_TOAST_KEY)
      toast.success(msg)
    }
  }, [])

  // Reset to phase 1 when the user edits the connection fields.
  // Bumps verifyReqId (stales any in-flight verify) and clears loading so the
  // Verify button is immediately re-enabled — even if a fetch is still pending.
  function handleTokenChange(v: string) { verifyReqId.current++; setToken(v); setVerifiedCreds(null); setWorkspaces([]); setLoading(false) }
  function handleOwnerChange(v: string) { verifyReqId.current++; setOwner(v); setVerifiedCreds(null); setWorkspaces([]); setLoading(false) }
  function handleRepoChange(v: string)  { verifyReqId.current++; setRepo(v);  setVerifiedCreds(null); setWorkspaces([]); setLoading(false) }

  // ── Shared: fetch + cache workspace directory list ───────────────────────────
  // `isAborted` is an optional getter so callers can suppress setter calls after
  // unmount (auto-fetch path) or when the request has become stale (verify path).
  async function doFetchWorkspaces(
    t: string, o: string, r: string,
    currentWs?: string,
    isAborted?: () => boolean,
  ): Promise<string[]> {
    const res = await fetch(
      `https://api.github.com/repos/${o}/${r}/contents/`,
      { headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? res.statusText)
    }
    const entries: { name: string; type: string }[] = await res.json()
    // Exclude hidden dirs (e.g. .github) and known infrastructure dirs (scripts)
    const EXCLUDED = new Set(['scripts', 'node_modules', 'dist', 'public', 'src'])
    const dirs = entries
      .filter(e => e.type === 'dir' && !e.name.startsWith('.') && !EXCLUDED.has(e.name))
      .map(e => e.name)

    // Bail out if the caller has been unmounted or superseded — don't update state
    // with results that no longer match what the user is looking at.
    if (isAborted?.()) return dirs

    // Only cache when we have results — avoids poisoning the cache with "[]"
    // which would cause a redundant API call on every subsequent mount.
    if (dirs.length > 0) localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(dirs))
    setWorkspaces(dirs)
    setWorkspace(prev => {
      const keep = currentWs ?? prev
      return dirs.includes(keep) ? keep : (dirs[0] ?? '')
    })
    return dirs
  }

  // ── Phase 1: verify repo + load workspace list ───────────────────────────────
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const t = token.trim(), o = owner.trim(), r = repo.trim()
    if (!t || !o || !r) { toast.error('Token, owner, and repository are required'); return }
    setLoading(true)
    const reqId = ++verifyReqId.current
    try {
      const dirs = await doFetchWorkspaces(t, o, r, undefined, () => reqId !== verifyReqId.current)
      // If the user edited the fields while we were waiting, discard this result entirely.
      if (reqId !== verifyReqId.current) return
      if (dirs.length === 0) {
        toast.error('No workspace directories found — add at least one top-level directory (e.g. "default/") to the repo on GitHub, then verify again.')
        return
      }
      setVerifiedCreds({ token: t, owner: o, repo: r })
    } catch (err) {
      if (reqId !== verifyReqId.current) return
      toast.error(`GitHub error: ${(err as Error).message ?? 'Network error'}`)
    } finally {
      if (reqId === verifyReqId.current) setLoading(false)
    }
  }

  // ── Phase 2: save full credentials ──────────────────────────────────────────
  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!verifiedCreds || !workspace || !workspaces.includes(workspace)) return
    const creds = { ...verifiedCreds, workspace }
    localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(creds))
    if (isFirstRun) {
      // Toast survives client-side navigation because Sonner's portal stays mounted in AppShell.
      toast.success('Connected — welcome to HECATE')
      navigate('/focus', { replace: true })
    } else {
      // window.location.reload() tears down the DOM before Sonner can flush the toast update.
      // Hand off the message via sessionStorage — the mount effect above picks it up after reload.
      sessionStorage.setItem(PENDING_TOAST_KEY, 'Credentials updated')
      // Any credential change (workspace, token, repo) invalidates the in-memory data store
      // whose slices are keyed against the previous credentials. Reload to guarantee a fresh
      // load — same pattern as AppShell.handleWorkspaceSwitch.
      window.location.reload()
    }
  }

  const phase2 = verifiedCreds !== null

  return (
    <div className="space-y-4">

      {/* ── Phase 1: connection details ── */}
      <form onSubmit={phase2 ? (e) => e.preventDefault() : handleVerify} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="token">Personal Access Token</Label>
          <Input
            id="token"
            type="password"
            placeholder="github_pat_…"
            value={token}
            onChange={e => handleTokenChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={loading || phase2}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="owner">Owner</Label>
            <Input
              id="owner"
              placeholder="carlofigs"
              value={owner}
              onChange={e => handleOwnerChange(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={loading || phase2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repo">Repository</Label>
            <Input
              id="repo"
              placeholder="HECATE_Data"
              value={repo}
              onChange={e => handleRepoChange(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={loading || phase2}
            />
          </div>
        </div>

        {!phase2 && (
          <Button type="submit" className={isFirstRun ? 'w-full' : ''} disabled={loading}>
            {loading ? 'Verifying…' : 'Verify & load workspaces'}
          </Button>
        )}
      </form>

      {/* ── Phase 2: workspace picker (appears after successful verify) ── */}
      {phase2 && (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-xs text-emerald-500">✓ Connected to {verifiedCreds.owner}/{verifiedCreds.repo}</span>
            <button
              type="button"
              onClick={() => { setVerifiedCreds(null); setWorkspaces([]) }}
              className="ml-auto text-[10px] text-muted-foreground/50 hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Change
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workspace">Workspace</Label>
            <select
              id="workspace"
              value={workspace}
              onChange={e => setWorkspace(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {workspaces.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground/50">
              Top-level directories in <code className="font-mono">{verifiedCreds.repo}</code>
            </p>
          </div>

          <Button
            type="submit"
            className={isFirstRun ? 'w-full' : ''}
            disabled={!workspace || !workspaces.includes(workspace)}
          >
            {isFirstRun ? 'Save & connect' : 'Update credentials'}
          </Button>

          {isFirstRun && (
            <p className="text-center text-xs text-muted-foreground">
              Stored in <code className="font-mono">localStorage</code> — never sent anywhere except GitHub.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
