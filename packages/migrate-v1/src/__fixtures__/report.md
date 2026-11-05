# HECATE v1 → v2 migration

Run at 2026-11-05T00:00:00.000Z · 2 workspaces · 2 ready

| Workspace | Policy | Tasks | Errors | Unaccounted | Result |
|---|---|---|---|---|---|
| club | open | 3 | 0 | 0 | ready |
| old-job | sanitised | 15 | 0 | 0 | ready |

## club

**Ready**

Policy `open` · time zone Australia/Sydney · working days 1,2,3,4,5 · sprints: none · settings from the config file

### Input (v1)

| File | Contents |
|---|---|
| tasks.json | 5 columns, 3 tasks |
| focus.json | 0 sections, 0 calendar events |
| projects.json | 1 project, 1 open question |
| weekly_log.json | 0 weeks |
| archive.json | 0 weeks, 0 done, 0 not doing |
| memory.json | 0 people, 0 terms, 0 project notes, 0 responsibilities, 0 reference files |
| settings.json | 5 settings |

### Output (v2)

| File | Contents |
|---|---|
| workspace.json | 5 statuses, 1 tag |
| profile.json | 0 responsibilities |
| tasks.json | 3 tasks (0 waiting) |
| focus/keep-in-mind.json | empty |
| projects/*.json | 1 project, 1 open question |
| people.json | 0 people |
| glossary.json | 0 terms |
| activity/2026-W45.jsonl | 1 entry (the import) |

### Task keys

|  | Tasks |
|---|---|
| On the board | 3 |
| Archived (kept) | 0 |
| Key taken from the v1 id (t-a12 → A12) | 0 |
| Key allocated after the highest kept number | 3 |
| Second board task with the same id (fresh key, no legacy id) | 0 |
| Archived in more than one week (earliest kept) | 0 |
| Archived but still on the board (board copy kept) | 0 |
| Archived without an id | 0 |

nextKey: A4 · B1

### Field accounting

| v1 field | Disposition | v2 | Seen |
|---|---|---|---|
| `tasks.columns` | transformed | workspace.json statuses, in board order | 1 |
| `tasks.columns[].id` | dropped | status ids are kebab-case slugs of the name | 5 |
| `tasks.columns[].name` | mapped | statuses[].name | 5 |
| `tasks.columns[].columnType` | transformed | statuses[].category (inferred from the name when unset) | 5 |
| `tasks.columns[].tasks` | transformed | tasks.json tasks; status = the column, order = position | 5 |
| `tasks.columns[].tasks[].id` | transformed | key (t-a12 → A12, t-b3 → B3, else allocated) + legacyIds | 3 |
| `tasks.columns[].tasks[].title` | mapped | title | 3 |
| `tasks.columns[].tasks[].note` | mapped | note | 3 |
| `tasks.columns[].tasks[].tags` | transformed | tags (slugs) + workspace tags; a project tag sets projectId | 3 |
| `tasks.columns[].tasks[].priority` | transformed | urgency (medium → med) | 3 |
| `tasks.columns[].tasks[].blockedSince` | to-text | note ("Blocked since …"); v2 derives blocked from dependsOn | 3 |
| `tasks.columns[].tasks[].createdAt` | mapped | createdAt | 3 |
| `tasks.columns[].tasks[].updatedAt` | mapped | updatedAt; completedAt for finished tasks | 3 |
| `focus.weekOf` | transformed | focus/{monday}.json (moved to its Monday) | 1 |
| `focus.sprintLabel` | to-text | section "Sprint" | 1 |
| `focus.updatedAt` | mapped | updatedAt | 1 |
| `focus.sections` | mapped | sections (freeform) | 1 |
| `projects.projects` | transformed | projects/{slug}.json | 1 |
| `projects.projects[].id` | transformed | slug (p- prefix removed) | 1 |
| `projects.projects[].name` | mapped | name | 1 |
| `projects.projects[].subtitle` | mapped | subtitle | 1 |
| `projects.projects[].summary` | mapped | summary | 1 |
| `projects.projects[].status` | transformed | status (in-progress → active, completed → done) | 1 |
| `projects.projects[].phase` | mapped | phase | 1 |
| `projects.projects[].currentFocus` | mapped | currentFocus | 1 |
| `projects.projects[].nextAction` | transformed | nextActions[0] | 1 |
| `projects.projects[].jira` | transformed | refs (Jira) | 1 |
| `projects.projects[].branch` | transformed | refs (Branch) | 1 |
| `projects.projects[].tag` | transformed | projectId on tasks with that tag | 1 |
| `projects.projects[].owner` | mapped | owner | 1 |
| `projects.projects[].updatedAt` | transformed | updatedAt (date → midnight UTC) | 1 |
| `projects.projects[].timeline` | mapped | timeline | 1 |
| `projects.projects[].openQuestions` | mapped | openQuestions | 1 |
| `projects.projects[].openQuestions[].id` | transformed | n (oq-3 → 3) | 1 |
| `projects.projects[].openQuestions[].question` | mapped | question | 1 |
| `projects.projects[].openQuestions[].blocker` | mapped | blocker | 1 |
| `projects.projects[].openQuestions[].status` | mapped | status | 1 |
| `projects.projects[].openQuestions[].resolution` | mapped | resolution | 1 |
| `projects.projects[].models` | to-text | section "Models" (a table) | 1 |
| `projects.projects[].sections` | mapped | sections | 1 |
| `weekly_log.weeks` | transformed | sprints/{n}.json (legacy) sections | 1 |
| `archive.weeks` | transformed | sprints/{n}.json (legacy) | 1 |
| `memory.updatedAt` | transformed | updatedAt of profile.json and people.json | 1 |
| `memory.me` | mapped | profile.json me | 1 |
| `memory.people` | transformed | people.json | 1 |
| `memory.terms` | transformed | glossary.json (merged case-insensitively) | 1 |
| `memory.projects` | transformed | the matching project's empty summary, else references/project-notes.md | 1 |
| `memory.recurringResponsibilities` | mapped | profile.json responsibilities | 1 |
| `memory.preferences` | mapped | profile.json preferences | 1 |
| `memory.productivitySystem` | mapped | profile.json productivitySystem | 1 |
| `memory.referenceFiles` | transformed | references/{slug}.md | 1 |
| `settings.oneOnOnePeople` | dropped | the week log's 1:1 sections carry each person | 1 |
| `settings.defaultView` | dropped | a device setting in v2 | 1 |
| `settings.autoSaveDebounceMs` | dropped | v2 writes are ops; nothing autosaves | 1 |
| `settings.pollIntervalMs` | dropped | a device setting in v2 | 1 |
| `settings.theme` | dropped | a device setting in v2 | 1 |

### Normalisations

|  | Count |
|---|---|
| Status category inferred from the column name | 1 |
| completedAt taken from updatedAt (finished tasks on the board) | 1 |
| Tasks linked to a project by its tag | 2 |
| Date-only updatedAt read as midnight UTC | 1 |
| Resolved question without a resolution: placeholder added | 1 |
| Empty focus page not carried over | 1 |

### Validation

- Loads as a v2 workspace: yes
- Errors: 0
- Warnings: 0

## old-job

**Ready**

Policy `sanitised` · time zone Australia/Sydney · working days 1,2,3,4,5 · sprints: none · settings from the config file

### Input (v1)

| File | Contents |
|---|---|
| tasks.json | 5 columns, 9 tasks |
| focus.json | 3 sections, 2 calendar events |
| projects.json | 2 projects, 4 open questions |
| weekly_log.json | 3 weeks |
| archive.json | 4 weeks, 7 done, 1 not doing |
| memory.json | 3 people, 3 terms, 2 project notes, 1 responsibility, 2 reference files |
| settings.json | 6 settings |

### Output (v2)

| File | Contents |
|---|---|
| workspace.json | 6 statuses (1 added), 3 tags |
| profile.json | 1 responsibility |
| tasks.json | 9 tasks (3 waiting) |
| focus/2026-04-13.json | 4 sections |
| focus/keep-in-mind.json | empty |
| projects/*.json | 2 projects, 4 open questions |
| sprints/*.json | 3 legacy sprints (-3, -2, -1), 5 done, 1 dropped, 13 sections |
| people.json | 3 people |
| glossary.json | 2 terms |
| references/*.md | 3 files |
| activity/2026-W45.jsonl | 1 entry (the import) |

### Task keys

|  | Tasks |
|---|---|
| On the board | 9 |
| Archived (kept) | 6 |
| Key taken from the v1 id (t-a12 → A12) | 10 |
| Key allocated after the highest kept number | 5 |
| Second board task with the same id (fresh key, no legacy id) | 1 |
| Archived in more than one week (earliest kept) | 1 |
| Archived but still on the board (board copy kept) | 1 |
| Archived without an id | 1 |

nextKey: A17 · B6

### Field accounting

| v1 field | Disposition | v2 | Seen |
|---|---|---|---|
| `tasks.schemaVersion` | dropped | v1 schema version; every v2 file carries its own | 1 |
| `tasks.columns` | transformed | workspace.json statuses, in board order | 1 |
| `tasks.columns[].id` | dropped | status ids are kebab-case slugs of the name | 5 |
| `tasks.columns[].name` | mapped | statuses[].name | 5 |
| `tasks.columns[].columnType` | transformed | statuses[].category (inferred from the name when unset) | 1 |
| `tasks.columns[].tasks` | transformed | tasks.json tasks; status = the column, order = position | 5 |
| `tasks.columns[].tasks[].id` | transformed | key (t-a12 → A12, t-b3 → B3, else allocated) + legacyIds | 9 |
| `tasks.columns[].tasks[].title` | mapped | title | 9 |
| `tasks.columns[].tasks[].note` | mapped | note | 9 |
| `tasks.columns[].tasks[].tags` | transformed | tags (slugs) + workspace tags; a project tag sets projectId | 9 |
| `tasks.columns[].tasks[].priority` | transformed | urgency (medium → med) | 9 |
| `tasks.columns[].tasks[].blockedSince` | to-text | note ("Blocked since …"); v2 derives blocked from dependsOn | 9 |
| `tasks.columns[].tasks[].createdAt` | mapped | createdAt | 9 |
| `tasks.columns[].tasks[].updatedAt` | mapped | updatedAt; completedAt for finished tasks | 9 |
| `focus.schemaVersion` | dropped | v1 schema version; every v2 file carries its own | 1 |
| `focus.weekOf` | transformed | focus/{monday}.json (moved to its Monday) | 1 |
| `focus.sprintLabel` | to-text | section "Sprint" | 1 |
| `focus.updatedAt` | mapped | updatedAt | 1 |
| `focus.sections` | mapped | sections (freeform) | 1 |
| `focus.sections[].id` | mapped | sections[].id | 3 |
| `focus.sections[].title` | mapped | sections[].title | 3 |
| `focus.sections[].content` | mapped | sections[].content | 3 |
| `focus.calendarEvents` | dropped | calendar sync retired (ADR 0006); skills capture the schedule | 1 |
| `projects.schemaVersion` | dropped | v1 schema version; every v2 file carries its own | 1 |
| `projects.projects` | transformed | projects/{slug}.json | 1 |
| `projects.projects[].id` | transformed | slug (p- prefix removed) | 2 |
| `projects.projects[].name` | mapped | name | 2 |
| `projects.projects[].subtitle` | mapped | subtitle | 2 |
| `projects.projects[].summary` | mapped | summary | 2 |
| `projects.projects[].status` | transformed | status (in-progress → active, completed → done) | 2 |
| `projects.projects[].phase` | mapped | phase | 2 |
| `projects.projects[].currentFocus` | mapped | currentFocus | 2 |
| `projects.projects[].nextAction` | transformed | nextActions[0] | 2 |
| `projects.projects[].jira` | transformed | refs (Jira) | 2 |
| `projects.projects[].branch` | transformed | refs (Branch) | 2 |
| `projects.projects[].tag` | transformed | projectId on tasks with that tag | 2 |
| `projects.projects[].owner` | mapped | owner | 2 |
| `projects.projects[].updatedAt` | transformed | updatedAt (date → midnight UTC) | 2 |
| `projects.projects[].timeline` | mapped | timeline | 2 |
| `projects.projects[].timeline[].phase` | mapped | timeline[].phase | 3 |
| `projects.projects[].timeline[].start` | mapped | timeline[].start | 3 |
| `projects.projects[].timeline[].end` | mapped | timeline[].end | 3 |
| `projects.projects[].timeline[].status` | transformed | timeline[].status (completed → done) | 3 |
| `projects.projects[].openQuestions` | mapped | openQuestions | 2 |
| `projects.projects[].openQuestions[].id` | transformed | n (oq-3 → 3) | 4 |
| `projects.projects[].openQuestions[].question` | mapped | question | 4 |
| `projects.projects[].openQuestions[].blocker` | mapped | blocker | 4 |
| `projects.projects[].openQuestions[].status` | mapped | status | 4 |
| `projects.projects[].openQuestions[].resolution` | mapped | resolution | 4 |
| `projects.projects[].models` | to-text | section "Models" (a table) | 2 |
| `projects.projects[].models[].name` | to-text | Models table | 2 |
| `projects.projects[].models[].layer` | to-text | Models table | 2 |
| `projects.projects[].models[].materialisationDev` | to-text | Models table | 2 |
| `projects.projects[].models[].materialisationProd` | to-text | Models table | 2 |
| `projects.projects[].models[].status` | to-text | Models table | 2 |
| `projects.projects[].sections` | mapped | sections | 2 |
| `projects.projects[].sections[].id` | mapped | sections[].id | 2 |
| `projects.projects[].sections[].title` | mapped | sections[].title | 2 |
| `projects.projects[].sections[].content` | mapped | sections[].content | 2 |
| `weekly_log.schemaVersion` | dropped | v1 schema version; every v2 file carries its own | 1 |
| `weekly_log.weeks` | transformed | sprints/{n}.json (legacy) sections | 1 |
| `weekly_log.weeks[].weekOf` | transformed | the legacy sprint containing its Monday | 3 |
| `weekly_log.weeks[].dateRange` | dropped | derived from the sprint start and end | 3 |
| `weekly_log.weeks[].generatedAt` | transformed | closedAt when the week has no archive | 3 |
| `weekly_log.weeks[].updatedAt` | dropped | superseded by the sprint closedAt | 3 |
| `weekly_log.weeks[].completed` | to-text | sprint section "Completed" | 3 |
| `weekly_log.weeks[].completed[].id` | transformed | the task key in the list item | 4 |
| `weekly_log.weeks[].completed[].title` | to-text | list item | 4 |
| `weekly_log.weeks[].completed[].note` | to-text | list item | 4 |
| `weekly_log.weeks[].completed[].tags` | to-text | list item | 4 |
| `weekly_log.weeks[].carriedForward` | to-text | sprint section "Carried forward" | 3 |
| `weekly_log.weeks[].carriedForward[].id` | transformed | the task key in the list item | 1 |
| `weekly_log.weeks[].carriedForward[].title` | to-text | list item | 1 |
| `weekly_log.weeks[].carriedForward[].note` | to-text | list item | 1 |
| `weekly_log.weeks[].carriedForward[].tags` | to-text | list item | 1 |
| `weekly_log.weeks[].delayed` | to-text | sprint section "Delayed" | 3 |
| `weekly_log.weeks[].delayed[].id` | transformed | the task key in the list item | 1 |
| `weekly_log.weeks[].delayed[].title` | to-text | list item | 1 |
| `weekly_log.weeks[].delayed[].note` | to-text | list item | 1 |
| `weekly_log.weeks[].delayed[].tags` | to-text | list item | 1 |
| `weekly_log.weeks[].nextWeek` | to-text | sprint section "Next week" | 3 |
| `weekly_log.weeks[].narrative` | to-text | sprint sections | 3 |
| `weekly_log.weeks[].narrative.meetingsAndDiscussions` | to-text | sprint section "Meetings and discussions" | 3 |
| `weekly_log.weeks[].narrative.decisionsMade` | to-text | sprint section "Decisions made" | 3 |
| `weekly_log.weeks[].narrative.frustrations` | to-text | sprint section "Frustrations" | 3 |
| `weekly_log.weeks[].narrative.oneOnOnePrep` | to-text | sprint sections "1:1 prep — …" | 3 |
| `weekly_log.weeks[].narrative.oneOnOnePrep.people` | dropped | each person with notes has a 1:1 section | 3 |
| `weekly_log.weeks[].narrative.oneOnOnePrep.sections` | to-text | sprint sections "1:1 prep — …" | 3 |
| `weekly_log.weeks[].narrative.oneOnOnePrep.sections.*` | to-text | sprint section content | 2 |
| `archive.schemaVersion` | dropped | v1 schema version; every v2 file carries its own | 1 |
| `archive.weeks` | transformed | sprints/{n}.json (legacy) | 1 |
| `archive.weeks[].weekOf` | transformed | the legacy sprint containing its Monday | 4 |
| `archive.weeks[].archivedAt` | transformed | closedAt; createdAt, updatedAt and completedAt of its tasks | 4 |
| `archive.weeks[].done` | transformed | sprints/{n}.json done (full tasks) | 4 |
| `archive.weeks[].done[].id` | transformed | key + legacyIds | 7 |
| `archive.weeks[].done[].title` | mapped | title | 7 |
| `archive.weeks[].done[].note` | mapped | note | 7 |
| `archive.weeks[].done[].tags` | transformed | tags (slugs) + workspace tags; a project tag sets projectId | 7 |
| `archive.weeks[].done[].originalColumn` | dropped | the archive bucket (done / not doing) decides the status | 7 |
| `archive.weeks[].notDoing` | transformed | sprints/{n}.json dropped (full tasks) | 4 |
| `archive.weeks[].notDoing[].id` | transformed | key + legacyIds | 1 |
| `archive.weeks[].notDoing[].title` | mapped | title | 1 |
| `archive.weeks[].notDoing[].note` | mapped | note | 1 |
| `archive.weeks[].notDoing[].tags` | transformed | tags (slugs) + workspace tags; a project tag sets projectId | 1 |
| `archive.weeks[].notDoing[].originalColumn` | dropped | the archive bucket (done / not doing) decides the status | 1 |
| `memory.schemaVersion` | dropped | v1 schema version; every v2 file carries its own | 1 |
| `memory.updatedAt` | transformed | updatedAt of profile.json and people.json | 1 |
| `memory.me` | mapped | profile.json me | 1 |
| `memory.people` | transformed | people.json | 1 |
| `memory.people[].name` | transformed | name (sanitised: removed; prose mentions become [role]) | 3 |
| `memory.people[].aliases` | transformed | aliases (sanitised: removed; prose mentions become [role]) | 3 |
| `memory.people[].role` | mapped | role | 3 |
| `memory.people[].notes` | mapped | notes | 3 |
| `memory.terms` | transformed | glossary.json (merged case-insensitively) | 1 |
| `memory.terms[].term` | mapped | term | 3 |
| `memory.terms[].meaning` | mapped | meaning | 3 |
| `memory.projects` | transformed | the matching project's empty summary, else references/project-notes.md | 1 |
| `memory.projects[].name` | transformed | matched to a project by name | 2 |
| `memory.projects[].summary` | mapped | project summary or reference section | 2 |
| `memory.recurringResponsibilities` | mapped | profile.json responsibilities | 1 |
| `memory.recurringResponsibilities[].name` | mapped | name | 1 |
| `memory.recurringResponsibilities[].cadence` | mapped | cadence | 1 |
| `memory.recurringResponsibilities[].notes` | mapped | notes | 1 |
| `memory.preferences` | mapped | profile.json preferences | 1 |
| `memory.productivitySystem` | mapped | profile.json productivitySystem | 1 |
| `memory.referenceFiles` | transformed | references/{slug}.md | 1 |
| `memory.referenceFiles.*` | mapped | reference file content | 2 |
| `settings.schemaVersion` | dropped | v1 schema version; every v2 file carries its own | 1 |
| `settings.oneOnOnePeople` | dropped | the week log's 1:1 sections carry each person | 1 |
| `settings.defaultView` | dropped | a device setting in v2 | 1 |
| `settings.autoSaveDebounceMs` | dropped | v2 writes are ops; nothing autosaves | 1 |
| `settings.pollIntervalMs` | dropped | a device setting in v2 | 1 |
| `settings.theme` | dropped | a device setting in v2 | 1 |

### Normalisations

|  | Count |
|---|---|
| weekOf moved to its Monday | 5 |
| Status category inferred from the column name | 5 |
| Status added for a category the board lacked | 1 |
| completedAt taken from updatedAt (finished tasks on the board) | 1 |
| Archived task timestamps taken from archivedAt | 6 |
| blockedSince appended to the note | 1 |
| Tasks linked to a project by its tag | 5 |
| Task references rewritten to keys | 10 |
| Task references left as written (no such task) | 1 |
| Week-log items whose task no longer exists | 1 |
| Text collapsed to one line | 1 |
| Date-only updatedAt read as midnight UTC | 2 |
| Open questions numbered afresh (missing or repeated number) | 2 |
| Glossary entries merged into an earlier one with the same term | 1 |
| Project summary taken from memory | 1 |
| Memory project notes moved to references/project-notes.md | 1 |
| Calendar events dropped (ADR 0006) | 2 |
| 1:1 notes for someone not in memory (name hidden) | 1 |
| Role that named someone, recorded as "Colleague" | 1 |

### Sanitising

|  | Count |
|---|---|
| Names replaced with roles | 18 |
| Possible names left in text (warnings; `--names` lists them locally) | 0 |

### Validation

- Loads as a v2 workspace: yes
- Errors: 0
- Warnings: 0
