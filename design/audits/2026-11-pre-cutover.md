# Pre-cutover audit — November 2026

**Scope:** every v2 surface, before cutover.

**Rules checked:** the Tier 0 register (`python design/rules.py --tier T0`), against the app's Extended conformance target (`DLS.md`).

**Where:** the e2e harness (the real Worker in workerd, the fake GitHub seeded from `apps/worker/e2e/fixture.ts`), at 320, 375, 640 and 1280 px, light and dark.

**Done by:** Claude, 2026-11-11, with Playwright.

**Status by layer**

| R-29 layer | Status |
|---|---|
| 1. Automated scan | Done. Axe in CI on every surface, unchanged. |
| 2. Keyboard-only pass | Done for every surface below. The parts a script can repeat are now e2e tests: `keyboard.spec.ts`, `motion.spec.ts`, and `layout.spec.ts` on every page. |
| 3. Screen-reader pass | **Not done:** it needs a real screen reader. It is the owner's, using the checklist at the end. Until it passes, components stay `candidate` (`DLS.md` §4). |

## Surfaces

| Page | Dialogs and menus it opens |
|---|---|
| Sign-in | — |
| Today (populated, empty, failed) | Add to plan, item menu, Close the day |
| Board (columns, and tabs when narrow) | New task, task editor, delete confirmation, Move menu |
| Projects, a project | New project, project editor, a question |
| Sprint (open, closed) | goal, Close sprint |
| More | — |
| People (with the glossary), a person | Add person, term, person editor, leave, remove (linked) |
| Activity | Add to log |
| Shell | navigation, workspace switcher, sign-out (and its confirmation while changes wait), offline and update banners, toasts with Undo |

## Findings

| # | Surface | Rule | Severity | Finding | Fix |
|---|---|---|---|---|---|
| 1 | Every dialog | R-06 | High | Closing a dialog (Escape, Close, Cancel) dropped focus on `<body>`. Radix returns focus to its own `Dialog.Trigger`, and HECATE opens dialogs from ordinary buttons. A keyboard user lost their place after every dialog. | `Dialog` and `ConfirmDialog` remember what had focus when they opened and return focus to it. If it has gone (a deleted task's card), focus goes to the page's `main`. `keyboard.spec.ts` checks all 15 dialogs. |
| 2 | Board (Move menu) | R-06 | High | After moving a task to another column from its Move menu, focus fell to `<body>`: the card re-renders in its new column, so the menu's trigger is gone. | `Menu` returns focus to its trigger, or else to the visible trigger with the same name (the moved card's own Move button), or else to `main`. Checked by "a task moves to another column with the keyboard alone". |
| 3 | Board, narrow | R-05, R-06 | Medium | Each column's tab panel was a tab stop (`tabindex="0"`, Radix's default) with `outline-none`: an invisible stop between the tabs and the cards. | The panel is no longer a tab stop (`tabIndex={-1}`): the column inside has its own controls (WAI-ARIA tabs pattern). |
| 4 | Every menu | R-05 | Medium | Menu items had `outline-none`, so the keyboard's item was marked only by a background change under 3:1. | The global `:focus-visible` ring now shows on the item. |
| 5 | Toasts | R-05 | Low | The toast list (reached with F8) had `outline-none`. | The ring shows. |
| 6 | Every page, offline | M-app-06, C-09 | Low | Offline, two warnings repeated each other: the shell's "You're offline" and the page's "Showing what HECATE had at …". | The page's banner gives way to the shell's while the browser is offline. It still shows when the browser is online but HECATE can't be reached. |
| 7 | Stale or failed page | R-25, R-06 | Medium | Try again gave no sign of trying: the banner, and the button with focus, vanished while it retried, then came back if it failed. | The banner stays. The button reads "Trying…" (`aria-disabled`, so it keeps focus) until the answer is in. |
| 8 | Activity | R-25 | Low | Mark all as read showed nothing while the Worker answered. | It reads "Marking as read…" until done. |
| 9 | Shell | R-25 | Low | Sign out showed nothing while the Worker answered. | The button is named "Signing out…" until the sign-in page replaces the app. |
| 10 | Nested dialogs | R-06 | Low, kept | An Escape pressed within the same frame a confirmation opens (under about 50 ms) reaches the dialog beneath, closing both. Radix registers the new top layer in an effect. A person cannot press that fast; a script can. | Recorded, not patched (it is Radix's internals). The keyboard spec waits two frames. |
| 11 | Every page, live (found by CI on this PR) | R-25, M-app-06 | Medium | A refresh that set off before a change could undo it. A tab opened from the device copy shows "Up to date" while its first refresh is still on its way. Mark all as read in another tab then cleared its count over the socket, and that refresh landed with the same version and the old count. "Activity 7 new" came back and stayed. The same could happen to "Saving to GitHub (n)". | The counts carry no version of their own, so for a given version the socket's newest counts win over a refresh's. A newer version announced during a refresh is fetched once it lands. Two store tests cover it, and `live.spec.ts` ran 90 of 90 over five repeats. |

## Checked and in order

| Check | What was found |
|---|---|
| **R-10** reflow | No page scrolls sideways at 320 px, or at 640 px (200% zoom at 1280). Now in CI for every page. |
| **R-11** text spacing | Line height 1.5, letter spacing 0.12em, word spacing 0.16em and paragraph spacing 2em clip nothing on any page. Now in CI for every page. |
| **R-13** structure | Every page has one `h1`, no skipped levels, one banner, one main and one Main navigation. Now in CI for every page. |
| **R-12** reduced motion | `base.css` makes every animation and transition instant. A dialog, a menu and a toast were measured; now in CI (`motion.spec.ts`). |
| **R-24** destructive actions | Each one confirms or offers Undo, and no confirm button is primary-styled: <ul><li>Delete task, remove person, sign out with changes waiting: confirm.</li><li>Remove leave, a term, a plan item, a priority or callout, or a project's item: Undo.</li><li>Complete: Undo.</li><li>Close sprint: a review dialog, and its own commit.</li></ul> |
| **R-08 / R-09** | No control without an accessible name, and no unhidden icon without a name, on any page at any width. |
| **R-07** targets | Unchanged (already in CI). |
| **Keyboard order** | Each page's order follows its reading order: shell, heading, primary action, sections. Dialogs open on their Close button (the first control). Confirmations open on Cancel. |
| **Kept: focus on open** | Dialogs keep that start rather than focusing the first field. Moving focus to an input would open the phone's keyboard over the bottom sheet, and components may not branch on pointer type. |

## The screen-reader pass (layer 3): checklist for the owner

**Setup:** run it on the preview Worker once it is live, or on the harness (`pnpm --filter @hecate/web build && pnpm --filter @hecate/worker harness`, then http://localhost:8788).

**Devices:**
- VoiceOver on an iPhone (Safari): triple-click the side button.
- VoiceOver on a Mac (Safari or Chrome): Cmd + F5.

Mark each row pass or fail. A failure goes back as a finding here; when every row for a component passes, it moves to `stable` in `DLS.md` §4.

| # | Where | Do | Expect to hear |
|---|---|---|---|
| 1 | Any page | Swipe from the top (iPhone); VO + U, Landmarks (Mac) | A banner, the Main navigation, main, and on the phone a second navigation for the bottom bar |
| 2 | Any page | Move to the sync status | "Up to date"; after a change, "Saving…" then "Saving to GitHub (1)", announced without moving focus |
| 3 | Header | Move to Activity | "Activity, 7 new" (the count is part of the name) |
| 4 | Today | Headings rotor | "Today" as heading level 1, then each section as level 2 |
| 5 | Today | Open an item's menu (More for "…"), choose Remove | The menu named, its items as menu items; then the toast "Removed from today's plan", with an Undo button reachable |
| 6 | Board, phone | Move along the column tabs | Each tab with its count ("To Do (2)") and "selected" on the current one |
| 7 | Board | Open Move A2, choose In Progress | The items as checkboxes, the current status "checked"; afterwards focus on Move A2 in its new column |
| 8 | Board | Complete A1 | The toast "Completed A1" with Undo; Undo puts it back |
| 9 | Task editor | Submit with an empty title | The problems summary announced and focused; each field's error read with the field |
| 10 | Delete confirmation | Open it from the task editor | "Delete A3?", its description, focus on Cancel; Escape returns to Delete task |
| 11 | Close the day | Go through an item's outcome | Each outcome as a radio group named by the plan item |
| 12 | A project | Move through Tasks | Archived tasks under their sprint's heading, not as links |
| 13 | Sprint | Review and close | The dialog named "Close sprint 7", the early-close warning read, the three groups as headings |
| 14 | A person | Remove someone still linked | The dialog "Robin is still linked" and what links to them |
| 15 | Activity | Move through an entry marked New | Time, who, kind, and "New" read as text, not just a coloured edge |
| 16 | Offline (Airplane mode) | Reload | "You're offline" banner read; the status says "Offline · as of …"; after a change, "Offline · 1 change waiting" |
| 17 | Sign out with a change waiting | Activate Sign out | "Sign out and lose 1 change?", focus on Cancel |
| 18 | Anywhere | Pinch-zoom to 200% (iPhone), Cmd + (Mac) | Nothing cut off; the page never scrolls sideways (the Board's row of columns may, inside itself) |
