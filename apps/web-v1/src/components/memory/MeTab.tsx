import { Prose } from './memoryShared'

export function MeTab({ content }: { content: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-4">
        <Prose content={content} />
      </div>
    </div>
  )
}
