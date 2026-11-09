import type { ComponentProps } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { KeyChip } from './Badge.tsx'
import { rehypeTaskKeys } from './taskKeys.ts'

/** design/components/markdown.md */
export interface MarkdownProps {
  children: string
  /** One paragraph rendered inline, inside a sentence or a list item. */
  inline?: boolean
  /** Where a task key links to; plain chips without it. */
  taskHref?: (key: string) => string
}

/** Headings inside a field never compete with the page outline (R-13): they render as strong text. */
const asText = ({ children }: ComponentProps<'h1'>) => <p className="text-heading-4">{children}</p>

const BASE: Components = {
  h1: asText, h2: asText, h3: asText, h4: asText, h5: asText, h6: asText,
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-stack-xs ps-inline-lg">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-stack-xs ps-inline-lg">{children}</ol>,
  a: ({ children, href }) => <a href={href} className="text-text-link underline" rel="noreferrer">{children}</a>,
  code: ({ children }) => <code className="rounded-control bg-bg-subtle px-inline-xs text-code">{children}</code>,
  table: ({ children }) => (
    <div className="overflow-x-auto" role="region" aria-label="Table" tabIndex={0}>
      <table className="text-body-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border-default px-inline-sm text-start text-label">{children}</th>,
  td: ({ children }) => <td className="border-b border-border-subtle px-inline-sm">{children}</td>,
}

export function Markdown({ children, inline = false, taskHref }: MarkdownProps) {
  const components: Components = {
    ...BASE,
    ...(inline ? { p: ({ children: c }) => <>{c}</> } : {}),
    span: ({ children: c, ...props }) => {
      const key = (props as Record<string, unknown>)['data-task-key']
      return typeof key === 'string' ? <KeyChip taskKey={key} {...(taskHref ? { href: taskHref(key) } : {})} /> : <span>{c}</span>
    },
  }
  const body = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeTaskKeys]} components={components} skipHtml>
      {children}
    </ReactMarkdown>
  )
  return inline ? body : <div className="flex flex-col gap-stack-sm">{body}</div>
}
