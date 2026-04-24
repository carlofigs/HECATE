/**
 * rehypeTaskIds — rehype plugin that detects task ID patterns in prose text
 * and replaces them with <task-id-chip> custom elements.
 *
 * Pattern matched: t-{prefix}-{alphanumeric}  e.g. t-a-lx3k9r, t-custom-abc123
 * Skipped: text inside <code> or <pre> blocks
 */

import { visit } from 'unist-util-visit'
import type { Root, Text, Element, Node, Parent } from 'hast'

const TASK_ID_RE = /\b(t-[a-z]+-[a-z0-9]+)\b/g

function isElement(node: Node): node is Element {
  return node.type === 'element'
}

export function rehypeTaskIds() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return
      // Don't process text inside code / pre blocks
      if (isElement(parent) && (parent.tagName === 'code' || parent.tagName === 'pre')) return

      const matches = [...node.value.matchAll(TASK_ID_RE)]
      if (!matches.length) return

      const parts: (Text | Element)[] = []
      let last = 0

      for (const match of matches) {
        const start = match.index!
        if (start > last) {
          parts.push({ type: 'text', value: node.value.slice(last, start) })
        }
        parts.push({
          type: 'element',
          tagName: 'task-id-chip',
          properties: { taskid: match[1] },
          children: [{ type: 'text', value: match[1] }],
        })
        last = start + match[0].length
      }

      if (last < node.value.length) {
        parts.push({ type: 'text', value: node.value.slice(last) })
      }

      // Replace the single text node with the split parts
      parent.children.splice(index, 1, ...(parts as Parent['children']))
    })
  }
}
