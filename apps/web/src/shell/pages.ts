import { CalendarDays, CalendarRange, FolderOpen, KanbanSquare, Users, type LucideIcon } from 'lucide-react'

/** The pages, in order. The phone's bottom bar shows the first two and "More", a page listing the rest (app-shell.md). */
export const PAGES: readonly { path: string; label: string; icon: LucideIcon; description: string }[] = [
  { path: 'today', label: 'Today', icon: CalendarDays, description: 'The day at a glance, and its plan.' },
  { path: 'board', label: 'Board', icon: KanbanSquare, description: 'Every task by status.' },
  { path: 'projects', label: 'Projects', icon: FolderOpen, description: 'Every project, with its tasks, deadlines and open questions.' },
  { path: 'sprint', label: 'Sprint', icon: CalendarRange, description: 'Review the sprint, write its retro, and close it.' },
  { path: 'people', label: 'People', icon: Users, description: 'The people you work with, their leave, and the glossary.' },
]
/** How many pages the bottom bar shows before "More": with the page's action, that is what fits at 320 px. */
export const IN_BAR = 2
