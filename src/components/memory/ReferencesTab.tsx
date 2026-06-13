/**
 * ReferencesTab — left file tree (grouped by top-level directory) + right
 * markdown render of the selected reference file.
 */

import { useState, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Prose } from './memoryShared'

/** Group reference file keys by top-level directory prefix */
function groupRefFiles(files: Record<string, string>): { dir: string; files: string[] }[] {
  const groups: Record<string, string[]> = { '': [] }
  for (const key of Object.keys(files).sort()) {
    const slash = key.indexOf('/')
    if (slash === -1) {
      groups[''].push(key)
    } else {
      const dir = key.slice(0, slash)
      ;(groups[dir] ??= []).push(key)
    }
  }
  return Object.entries(groups)
    .filter(([, f]) => f.length > 0)
    .map(([dir, f]) => ({ dir, files: f }))
    .sort((a, b) => {
      if (a.dir === '') return -1
      if (b.dir === '') return 1
      return a.dir.localeCompare(b.dir)
    })
}

function fileLabel(path: string): string {
  const slash = path.lastIndexOf('/')
  const base  = slash === -1 ? path : path.slice(slash + 1)
  return base.replace(/\.md$/, '')
}

export function ReferencesTab({ files }: { files: Record<string, string> }) {
  const groups = useMemo(() => groupRefFiles(files), [files])

  // Stable initial selection: first file in the sorted tree
  const firstFile = useMemo(
    () => groups[0]?.files[0] ?? '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentionally only on mount
  )
  const [selected, setSelected] = useState<string>(firstFile)

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: file tree ── */}
      <div className="w-44 shrink-0 border-r border-border overflow-y-auto py-2 bg-card/30">
        {groups.map(({ dir, files: dirFiles }) => (
          <div key={dir || '__root'} className="mb-1">
            {dir && (
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/35 select-none">
                {dir}/
              </p>
            )}
            {dirFiles.map(path => (
              <button
                key={path}
                onClick={() => setSelected(path)}
                className={cn(
                  'w-full flex items-start gap-1.5 px-3 py-1.5 text-left transition-colors text-[11px] leading-snug',
                  selected === path
                    ? 'bg-primary/8 text-primary border-r-2 border-r-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                <FileText className="w-3 h-3 shrink-0 opacity-50 mt-px" />
                <span className="break-words min-w-0">{fileLabel(path)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Right: rendered content ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
        {selected && files[selected] ? (
          <>
            <p className="text-[10px] font-mono text-muted-foreground/25 mb-3 select-all">
              {selected}
            </p>
            <div className="max-w-2xl">
              <Prose content={files[selected]} />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground/40 italic py-8 text-center">
            Select a file from the tree
          </p>
        )}
      </div>
    </div>
  )
}
