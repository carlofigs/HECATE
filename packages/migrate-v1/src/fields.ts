/**
 * fields.ts — where every v1 field goes.
 *
 * Each key path v1 can write (as collectPaths spells it) has one entry. A path
 * found in the data with no entry here is an unaccounted field: the report
 * lists it as an error and the CLI fails, so nothing is lost without a
 * decision. `subtree` entries account for everything below them (used for
 * data that is dropped whole).
 */

export type Disposition = 'mapped' | 'transformed' | 'to-text' | 'dropped'

export interface FieldEntry {
  disposition: Disposition
  /** Where it lands in v2, or why it is dropped. */
  target: string
  subtree?: true
}

const mapped = (target: string): FieldEntry => ({ disposition: 'mapped', target })
const transformed = (target: string): FieldEntry => ({ disposition: 'transformed', target })
const toText = (target: string): FieldEntry => ({ disposition: 'to-text', target })
const dropped = (why: string, subtree?: true): FieldEntry => ({ disposition: 'dropped', target: why, ...(subtree ? { subtree } : {}) })

const VERSION = dropped('v1 schema version; every v2 file carries its own')

const snapshot = (base: string, title: string): Record<string, FieldEntry> => ({
  [base]: toText(`sprint section "${title}"`),
  [`${base}[].id`]: transformed('the task key in the list item'),
  [`${base}[].title`]: toText('list item'),
  [`${base}[].note`]: toText('list item'),
  [`${base}[].tags`]: toText('list item'),
})

const archived = (base: string, bucket: 'done' | 'dropped'): Record<string, FieldEntry> => ({
  [base]: transformed(`sprints/{n}.json ${bucket} (full tasks)`),
  [`${base}[].id`]: transformed('key + legacyIds'),
  [`${base}[].title`]: mapped('title'),
  [`${base}[].note`]: mapped('note'),
  [`${base}[].tags`]: transformed('tags (slugs) + workspace tags; a project tag sets projectId'),
  [`${base}[].originalColumn`]: dropped('the archive bucket (done / not doing) decides the status'),
})

export const FIELD_MAP: Readonly<Record<string, FieldEntry>> = {
  // tasks.json
  'tasks.schemaVersion': VERSION,
  'tasks.columns': transformed('workspace.json statuses, in board order'),
  'tasks.columns[].id': dropped('status ids are kebab-case slugs of the name'),
  'tasks.columns[].name': mapped('statuses[].name'),
  'tasks.columns[].columnType': transformed('statuses[].category (inferred from the name when unset)'),
  'tasks.columns[].tasks': transformed('tasks.json tasks; status = the column, order = position'),
  'tasks.columns[].tasks[].id': transformed('key (t-a12 → A12, t-b3 → B3, else allocated) + legacyIds'),
  'tasks.columns[].tasks[].title': mapped('title'),
  'tasks.columns[].tasks[].note': mapped('note'),
  'tasks.columns[].tasks[].tags': transformed('tags (slugs) + workspace tags; a project tag sets projectId'),
  'tasks.columns[].tasks[].priority': transformed('urgency (medium → med)'),
  'tasks.columns[].tasks[].blockedSince': toText('note ("Blocked since …"); v2 derives blocked from dependsOn'),
  'tasks.columns[].tasks[].createdAt': mapped('createdAt'),
  'tasks.columns[].tasks[].updatedAt': mapped('updatedAt; completedAt for finished tasks'),

  // focus.json
  'focus.schemaVersion': VERSION,
  'focus.weekOf': transformed('focus/{monday}.json (moved to its Monday)'),
  'focus.sprintLabel': toText('section "Sprint"'),
  'focus.updatedAt': mapped('updatedAt'),
  'focus.sections': mapped('sections (freeform)'),
  'focus.sections[].id': mapped('sections[].id'),
  'focus.sections[].title': mapped('sections[].title'),
  'focus.sections[].content': mapped('sections[].content'),
  'focus.calendarEvents': dropped('calendar sync retired (ADR 0006); skills capture the schedule', true),

  // projects.json
  'projects.schemaVersion': VERSION,
  'projects.projects': transformed('projects/{slug}.json'),
  'projects.projects[].id': transformed('slug (p- prefix removed)'),
  'projects.projects[].name': mapped('name'),
  'projects.projects[].subtitle': mapped('subtitle'),
  'projects.projects[].summary': mapped('summary'),
  'projects.projects[].status': transformed('status (in-progress → active, completed → done)'),
  'projects.projects[].phase': mapped('phase'),
  'projects.projects[].currentFocus': mapped('currentFocus'),
  'projects.projects[].nextAction': transformed('nextActions[0]'),
  'projects.projects[].jira': transformed('refs (Jira)'),
  'projects.projects[].branch': transformed('refs (Branch)'),
  'projects.projects[].tag': transformed('projectId on tasks with that tag'),
  'projects.projects[].owner': mapped('owner'),
  'projects.projects[].updatedAt': transformed('updatedAt (date → midnight UTC)'),
  'projects.projects[].timeline': mapped('timeline'),
  'projects.projects[].timeline[].phase': mapped('timeline[].phase'),
  'projects.projects[].timeline[].start': mapped('timeline[].start'),
  'projects.projects[].timeline[].end': mapped('timeline[].end'),
  'projects.projects[].timeline[].status': transformed('timeline[].status (completed → done)'),
  'projects.projects[].openQuestions': mapped('openQuestions'),
  'projects.projects[].openQuestions[].id': transformed('n (oq-3 → 3)'),
  'projects.projects[].openQuestions[].question': mapped('question'),
  'projects.projects[].openQuestions[].blocker': mapped('blocker'),
  'projects.projects[].openQuestions[].status': mapped('status'),
  'projects.projects[].openQuestions[].resolution': mapped('resolution'),
  'projects.projects[].models': toText('section "Models" (a table)'),
  'projects.projects[].models[].name': toText('Models table'),
  'projects.projects[].models[].layer': toText('Models table'),
  'projects.projects[].models[].materialisationDev': toText('Models table'),
  'projects.projects[].models[].materialisationProd': toText('Models table'),
  'projects.projects[].models[].status': toText('Models table'),
  'projects.projects[].sections': mapped('sections'),
  'projects.projects[].sections[].id': mapped('sections[].id'),
  'projects.projects[].sections[].title': mapped('sections[].title'),
  'projects.projects[].sections[].content': mapped('sections[].content'),

  // weekly_log.json
  'weekly_log.schemaVersion': VERSION,
  'weekly_log.weeks': transformed('sprints/{n}.json (legacy) sections'),
  'weekly_log.weeks[].weekOf': transformed('the legacy sprint containing its Monday'),
  'weekly_log.weeks[].dateRange': dropped('derived from the sprint start and end'),
  'weekly_log.weeks[].generatedAt': transformed('closedAt when the week has no archive'),
  'weekly_log.weeks[].updatedAt': dropped('superseded by the sprint closedAt'),
  ...snapshot('weekly_log.weeks[].completed', 'Completed'),
  ...snapshot('weekly_log.weeks[].carriedForward', 'Carried forward'),
  ...snapshot('weekly_log.weeks[].delayed', 'Delayed'),
  'weekly_log.weeks[].nextWeek': toText('sprint section "Next week"'),
  'weekly_log.weeks[].narrative': toText('sprint sections'),
  'weekly_log.weeks[].narrative.meetingsAndDiscussions': toText('sprint section "Meetings and discussions"'),
  'weekly_log.weeks[].narrative.decisionsMade': toText('sprint section "Decisions made"'),
  'weekly_log.weeks[].narrative.frustrations': toText('sprint section "Frustrations"'),
  'weekly_log.weeks[].narrative.oneOnOnePrep': toText('sprint sections "1:1 prep — …"'),
  'weekly_log.weeks[].narrative.oneOnOnePrep.people': dropped('each person with notes has a 1:1 section'),
  'weekly_log.weeks[].narrative.oneOnOnePrep.sections': toText('sprint sections "1:1 prep — …"'),
  'weekly_log.weeks[].narrative.oneOnOnePrep.sections.*': toText('sprint section content'),

  // archive.json
  'archive.schemaVersion': VERSION,
  'archive.weeks': transformed('sprints/{n}.json (legacy)'),
  'archive.weeks[].weekOf': transformed('the legacy sprint containing its Monday'),
  'archive.weeks[].archivedAt': transformed('closedAt; createdAt, updatedAt and completedAt of its tasks'),
  ...archived('archive.weeks[].done', 'done'),
  ...archived('archive.weeks[].notDoing', 'dropped'),

  // memory.json
  'memory.schemaVersion': VERSION,
  'memory.updatedAt': transformed('updatedAt of profile.json and people.json'),
  'memory.me': mapped('profile.json me'),
  'memory.people': transformed('people.json'),
  'memory.people[].name': transformed('name (sanitised: removed; prose mentions become [role])'),
  'memory.people[].aliases': transformed('aliases (sanitised: removed; prose mentions become [role])'),
  'memory.people[].role': mapped('role'),
  'memory.people[].notes': mapped('notes'),
  'memory.terms': transformed('glossary.json (merged case-insensitively)'),
  'memory.terms[].term': mapped('term'),
  'memory.terms[].meaning': mapped('meaning'),
  'memory.projects': transformed('the matching project\'s empty summary, else references/project-notes.md'),
  'memory.projects[].name': transformed('matched to a project by name'),
  'memory.projects[].summary': mapped('project summary or reference section'),
  'memory.recurringResponsibilities': mapped('profile.json responsibilities'),
  'memory.recurringResponsibilities[].name': mapped('name'),
  'memory.recurringResponsibilities[].cadence': mapped('cadence'),
  'memory.recurringResponsibilities[].notes': mapped('notes'),
  'memory.preferences': mapped('profile.json preferences'),
  'memory.productivitySystem': mapped('profile.json productivitySystem'),
  'memory.referenceFiles': transformed('references/{slug}.md'),
  'memory.referenceFiles.*': mapped('reference file content'),

  // settings.json
  'settings.schemaVersion': VERSION,
  'settings.oneOnOnePeople': dropped('the week log\'s 1:1 sections carry each person'),
  'settings.defaultView': dropped('a device setting in v2'),
  'settings.autoSaveDebounceMs': dropped('v2 writes are ops; nothing autosaves'),
  'settings.pollIntervalMs': dropped('a device setting in v2'),
  'settings.theme': dropped('a device setting in v2'),
}

/** The entry that accounts for a path: its own, or a dropped ancestor's subtree. */
export function entryFor(path: string): FieldEntry | null {
  const own = FIELD_MAP[path]
  if (own) return own
  for (let cut = path.lastIndexOf('.'); cut > 0; cut = path.lastIndexOf('.', cut - 1)) {
    const ancestor = FIELD_MAP[path.slice(0, cut).replace(/\[\]$/, '')]
    if (ancestor?.subtree) return ancestor
  }
  return null
}
