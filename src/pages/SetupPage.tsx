import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { GitHubCredentials } from '@/lib/schemas'

const STORAGE_KEY = 'hecate:credentials'

export default function SetupPage() {
  const navigate = useNavigate()

  // Pre-populate from existing credentials if editing
  const existing: GitHubCredentials | null = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()

  const [token, setToken]     = useState(existing?.token ?? '')
  const [owner, setOwner]     = useState(existing?.owner ?? '')
  const [repo, setRepo]       = useState(existing?.repo  ?? '')
  const [testing, setTesting] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = { token: token.trim(), owner: owner.trim(), repo: repo.trim() }

    if (!trimmed.token || !trimmed.owner || !trimmed.repo) {
      toast.error('All fields are required')
      return
    }

    setTesting(true)
    try {
      // Verify token + repo are reachable
      const res = await fetch(
        `https://api.github.com/repos/${trimmed.owner}/${trimmed.repo}`,
        { headers: { Authorization: `Bearer ${trimmed.token}`, Accept: 'application/vnd.github+json' } },
      )
      if (!res.ok) {
        const { message } = await res.json().catch(() => ({ message: res.statusText }))
        toast.error(`GitHub API error: ${message}`)
        return
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      toast.success('Connected — welcome to HECATE')
      navigate('/focus', { replace: true })
    } catch (err) {
      toast.error('Network error — check your connection')
      console.error(err)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Header */}
        <div className="space-y-1 text-center">
          <p className="font-mono text-xs tracking-[0.3em] text-primary uppercase">
            HECATE
          </p>
          <h1 className="text-xl font-semibold text-foreground">
            Connect your repository
          </h1>
          <p className="text-sm text-muted-foreground">
            A fine-grained GitHub PAT with <em>Contents</em> read/write access on your data repo.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="token">Personal Access Token</Label>
            <Input
              id="token"
              type="password"
              placeholder="github_pat_…"
              value={token}
              onChange={e => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                placeholder="carlofigs"
                value={owner}
                onChange={e => setOwner(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repo">Repository</Label>
              <Input
                id="repo"
                placeholder="HECATE"
                value={repo}
                onChange={e => setRepo(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={testing}>
            {testing ? 'Verifying…' : 'Save & connect'}
          </Button>
        </form>

        {/* Hint */}
        <p className="text-center text-xs text-muted-foreground">
          Credentials are stored locally in <code className="font-mono">localStorage</code> — never sent anywhere except GitHub.
        </p>
      </div>
    </div>
  )
}
