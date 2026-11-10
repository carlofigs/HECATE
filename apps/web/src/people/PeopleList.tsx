import { formatDay, peopleList, todayIn, type PersonRow, type WorkspaceState } from '@hecate/core'
import { Badge, Banner, Button, Markdown, TextField } from '@hecate/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import { ICON, Item, Section } from '../sections.tsx'
import { PageShell } from '../shell/PageShell.tsx'
import { useBottomActionSlot } from '../shell/slots.ts'
import { useActions } from '../useActions.ts'
import { useNow } from '../useNow.ts'
import { PersonEditor, TermEditor } from './editors.tsx'
import { glossary, isSanitised, removeTermOps, restoreTermOps, type Term } from './people.ts'

const projectName = (state: WorkspaceState, id: string): string => Object.values(state.projects).find(p => p.id === id)?.name ?? 'unknown'
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`
const away = (r: NonNullable<PersonRow['away']>): string => (r.start === r.end ? formatDay(r.start) : `${formatDay(r.start)} – ${formatDay(r.end)}`)

/** Everyone in the workspace, and its glossary. design/components/people-pages.md */
export function PeopleList() {
  const now = useNow()
  const { workspace = '' } = useParams()
  const navigate = useNavigate()
  const slot = useBottomActionSlot()
  const actions = useActions()
  const [adding, setAdding] = useState(false)
  const base = `/w/${encodeURIComponent(workspace)}/people`

  const addPerson = (
    <Button variant="primary" icon={<Plus aria-hidden="true" className={ICON} />} onClick={() => setAdding(true)}>
      Add person
    </Button>
  )
  return (
    <>
      <PageShell title="People" actions={<div className="max-md:hidden">{addPerson}</div>}>
        {snapshot => (
          <>
            <Body state={snapshot.state} rows={peopleList(snapshot.state, todayIn(snapshot.state.workspace.timezone, now))} />
            {adding ? (
              <PersonEditor state={snapshot.state} person={null} onClose={() => setAdding(false)} onCreated={id => void navigate(`${base}/${id}`)} save={actions.save} />
            ) : null}
          </>
        )}
      </PageShell>
      {slot ? createPortal(addPerson, slot) : null}
    </>
  )
}

function Body({ state, rows }: { state: WorkspaceState; rows: PersonRow[] }) {
  const actions = useActions()
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<{ term: Term | null } | null>(null)
  const sanitised = isSanitised(state)
  const terms = glossary(state, filter)
  const remove = (t: Term) => () =>
    actions.change(removeTermOps(t), `Remove the term ${t.term}`, { title: 'Removed a term', description: t.term, undo: restoreTermOps(state, t) })

  return (
    <div className="flex flex-col gap-stack-lg">
      {sanitised ? (
        <Banner tone="info" title="Roles only">
          This workspace is sanitised: people are recorded by role, never by name.
        </Banner>
      ) : null}
      <div className="grid gap-stack-lg lg:grid-cols-2">
        <Section id="people" title="People" empty="No one yet. Add the people you work with, by role.">
          {rows.map(r => (
            <li key={r.id} className="flex flex-col gap-stack-xs">
              <span className="flex flex-wrap items-baseline gap-inline-sm">
                <Link to={r.id} className="inline-flex min-h-(--size-target-default) items-center text-body-md text-text-link underline">
                  {r.label}
                </Link>
                {r.name ? <span className="text-body-sm text-text-secondary">{r.role}</span> : null}
                {r.away ? <Badge tone="info">Away {away(r.away)}</Badge> : null}
              </span>
              <span className="flex flex-wrap gap-x-inline-md text-body-sm text-text-secondary">
                {r.aliases.length > 0 ? <span>Also {r.aliases.join(', ')}</span> : null}
                {r.waiting > 0 ? <span>{plural(r.waiting, 'task waits on them', 'tasks wait on them')}</span> : null}
              </span>
            </li>
          ))}
        </Section>

        <Section
          id="glossary"
          title="Glossary"
          empty={filter ? `No terms match “${filter.trim()}”.` : 'No terms yet.'}
          lead={
            state.glossary.terms.length > 0 ? (
              <TextField label="Filter the glossary" hint="By term, alias or meaning" type="search" value={filter} onChange={e => setFilter(e.target.value)} />
            ) : null
          }
          footer={
            <Button variant="ghost" icon={<Plus aria-hidden="true" className={ICON} />} onClick={() => setEditing({ term: null })}>
              Add a term
            </Button>
          }
        >
          {terms.map(t => (
            <Item key={t.id} name={t.term} onEdit={() => setEditing({ term: t })} onRemove={remove(t)}>
              <span className="flex flex-wrap items-baseline gap-inline-sm">
                <span className="text-label text-text-primary">{t.term}</span>
                {t.aliases.length > 0 ? <span className="text-body-sm text-text-secondary">also {t.aliases.join(', ')}</span> : null}
                {t.projectId ? <span className="text-body-sm text-text-secondary">Project {projectName(state, t.projectId)}</span> : null}
              </span>
              <div className="text-body-sm text-text-primary">
                <Markdown>{t.meaning}</Markdown>
              </div>
            </Item>
          ))}
        </Section>
      </div>
      {editing ? <TermEditor key={editing.term?.id ?? 'new'} state={state} term={editing.term} onClose={() => setEditing(null)} save={actions.save} /> : null}
    </div>
  )
}
