# Person, leave and term editors

**Status:** candidate   **Since:** 0.8.0   **Profile(s):** app   **Base:** `Dialog`, the field components

`apps/web/src/people/editors.tsx` (rules: `people.ts`)

## What it is

Three dialogs that share one form behaviour:
- **Person:** a person, new or existing;
- **Leave:** one leave range;
- **Term:** a glossary term.

## When to use

- **Add person** and **Edit** (person).
- **Add leave**, and a range's Edit (leave).
- **Add a term**, and a term's Edit (term).

## When not to use → use instead

- Linking a person to a task or cutoff → the Person pickers in those editors.

## Anatomy

| Editor | Fields |
|---|---|
| Person | Role (required); Name and Aliases (open workspaces only); Notes. A sanitised workspace shows a "Roles only" banner instead of the name fields |
| Leave | First day, Last day (both required), Note |
| Term | Term (required), Aliases, Meaning (required), Project |

Each also has a summary (`Banner` danger, focused on submit), and the actions: Add … / Save (primary, end) and Cancel.

## Variants

- New and edit.

## States

| State | Visual | n/a? |
|---|---|---|
| default | As anatomy | |
| error | Field messages after blur; the summary after submit | |
| refused | A `Banner` "Not saved" with the engine's reason | |
| loading | — | n/a: saving is local and immediate |

## Behaviour

- **Person:**
  - a new person gets an id chosen in the browser, so their page opens at once;
  - an edit is a `person.upsert` of only the changed fields.
- **Leave:** `person.upsert` with the person's whole `ooo` list (core replaces it whole).
- **Term:** `term.upsert` with its id and every field. The term must be new to the glossary, ignoring case, as core checks.
- **Checks:**
  - lines are one line of at most 500 characters;
  - the last day is not before the first;
  - no name or aliases in a sanitised workspace.
- **Responsive (C-10):** a sheet below `md`.

## Accessibility (C-08)

- As `Dialog` and the fields.
- The summary is `role="alert"` and focused.

## Content (C-09)

- "Give their role, such as Data engineer or Finance team."
- "The last day cannot be before the first."
- "“CMS” is already in the glossary. Edit that one instead."

## Tokens consumed

Those of `Dialog`, `TextField`, `TextAreaField`, `SelectField`, `Banner`, `Button`; `space.stack.md`, `space.stack.sm`, `space.inline.sm`, `space.inline.lg`.

## Code example

```tsx
<PersonEditor state={state} person={null} onClose={close} onCreated={id => navigate(id)} save={actions.save} />
```

## Related components

- People pages, the project item editor (the same pattern).

## Do / Don't

- **Do** send leave as the whole list.
- **Don't** offer a name in a sanitised workspace: core refuses it.

## Open questions

- None.

## Changelog

- 0.8.0: created.
