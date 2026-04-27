/// <reference types="vite/client" />

// lucide-react ships JS-only in this environment; declare it to satisfy strict tsc
declare module 'lucide-react' {
  import * as React from 'react'
  export interface LucideProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string
    absoluteStrokeWidth?: boolean
  }
  export type LucideIcon = React.FC<LucideProps>

  export const Focus: LucideIcon
  export const Kanban: LucideIcon
  export const FolderKanban: LucideIcon
  export const CalendarDays: LucideIcon
  export const Archive: LucideIcon
  export const Brain: LucideIcon
  export const Sun: LucideIcon
  export const Moon: LucideIcon
  export const Settings: LucideIcon
  export const MoreHorizontal: LucideIcon
  export const X: LucideIcon
  export const ChevronDown: LucideIcon
  export const ChevronRight: LucideIcon
  export const ChevronLeft: LucideIcon
  export const Plus: LucideIcon
  export const Pencil: LucideIcon
  export const Trash2: LucideIcon
  export const GripVertical: LucideIcon
  export const Tag: LucideIcon
  export const AlertCircle: LucideIcon
  export const Clock: LucideIcon
  export const Check: LucideIcon
  export const Search: LucideIcon
  export const Filter: LucideIcon
  export const RefreshCw: LucideIcon
  export const Save: LucideIcon
  export const ExternalLink: LucideIcon
  export const Copy: LucideIcon
  export const Info: LucideIcon
  export const Loader2: LucideIcon
  export const LayoutList: LucideIcon
  export const CheckCircle2: LucideIcon
  export const Command: LucideIcon
  export const Hash: LucideIcon
  export const Cloud: LucideIcon
  export const CloudUpload: LucideIcon
  export const WifiOff: LucideIcon
  export const AlertTriangle: LucideIcon
}
