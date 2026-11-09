/**
 * A rehype step that marks task keys (A12, B3) in Markdown text, so the
 * renderer can show them as chips. Text inside code and links is left alone.
 */

const TASK_KEY = /\b[AB][1-9]\d*\b/g

interface Text { type: 'text'; value: string }
interface Element { type: 'element'; tagName: string; properties: Record<string, unknown>; children: Node[] }
interface Parent { type: string; children?: Node[] }
type Node = Text | Element | Parent

const SKIP = new Set(['code', 'pre', 'a'])

/** Splits one text value into text and key parts. */
export function splitKeys(value: string): ({ text: string } | { key: string })[] {
  const parts: ({ text: string } | { key: string })[] = []
  let last = 0
  for (const match of value.matchAll(TASK_KEY)) {
    if (match.index > last) parts.push({ text: value.slice(last, match.index) })
    parts.push({ key: match[0] })
    last = match.index + match[0].length
  }
  if (last < value.length) parts.push({ text: value.slice(last) })
  return parts
}

function visit(node: Parent): void {
  if (!node.children) return
  node.children = node.children.flatMap((child): Node[] => {
    if (child.type === 'text') {
      return splitKeys((child as Text).value).map(part =>
        'key' in part
          ? { type: 'element', tagName: 'span', properties: { dataTaskKey: part.key }, children: [{ type: 'text', value: part.key }] }
          : { type: 'text', value: part.text },
      )
    }
    if (child.type === 'element' && SKIP.has((child as Element).tagName)) return [child]
    visit(child)
    return [child]
  })
}

/** The rehype plugin. */
export function rehypeTaskKeys() {
  return (tree: Parent): void => visit(tree)
}
