# 0009 — A copy of HECATE on the device

**Status:** Accepted (Nov 2026)

## Context

P6 asks that "the snapshot and unsent changes survive a reload while offline".
Until now the web app held everything in memory:

- An offline reload failed its start-up session check and showed "Can't reach
  HECATE".
- A change waiting to be sent died with the tab, so the only guard was a
  `beforeunload` prompt.

The app's rule so far was that nothing credential-like goes in JavaScript
storage, and that `localStorage` holds UI preferences only (ADR 0003). Workspace
data is not a credential. But keeping it in the browser means it sits on the
device, outside the session, so it is decided here.

## Decision

**What is kept.** The app keeps a copy in IndexedDB (database `hecate`), in three stores:

| Store | Holds |
|---|---|
| `session` | Who is signed in (user id and login) and the workspace list, so the app can start without the network. |
| `snapshots` | Each workspace opened, as the Worker last sent it, without unsent changes. |
| `batches` | Each unsent batch, as prepared (ADR 0004), one record per `opId`. |

**Which workspaces.** Every workspace you open is kept, sanitised (work) ones
included; that was the owner's choice. A sanitised workspace holds roles, never
names (ADR 0005), and the copy is exactly what the snapshot already brings into
the page.

**How it is used**
- **Start-up:** if the Worker cannot be reached at start-up, the app starts
  from the session copy and marks the session `offline`. It is confirmed on
  reconnect; a `signed-out` answer then signs out.
- **Opening a workspace:** the copy shows at once, with its unsent batches
  folded on top, and the Worker's answer replaces it. That answer is taken
  whatever its version, since versions start again if the Durable Object's
  storage is ever reset.
- **Unsent changes:** a batch is kept from the moment it is queued until the
  Worker answers it. When it is applied, the snapshot that includes it is
  saved before the batch is let go.
- **Several tabs:** batches are one record each, so tabs never overwrite each
  other's queue. A tab that opens a workspace restores every stored batch for
  it, and sends it; one sent twice is a harmless duplicate, because the Worker
  deduplicates by `opId` (ADR 0004).

**What clears it**
- **Sign-out** clears everything on the device. If changes are still waiting,
  the page first asks: "Sign out and lose 1 change?".
- **An offline sign-out** cannot clear the httpOnly cookie. The app clears the
  device anyway, sets a `hecate:sign-out` flag in `localStorage` (a flag, not a
  credential), and finishes at the next start by calling `/auth/logout` before
  anything else.
- **A `signed-out` answer** from the Worker (the session expired) clears the
  session and the snapshots, but keeps unsent batches, which are sent after
  the next sign-in. An expired session never loses work.
- **Age:** a session or snapshot older than 14 days (`SESSION_SECONDS`) is not
  used, and is deleted.
- **Another build:** a snapshot saved under other file versions
  (`CURRENT_VERSION`) is discarded; its batches are kept, for the Worker to
  validate when they are sent.

**Never in the way.** If IndexedDB is unavailable (a private window, or blocked
site data) or a write fails, the app behaves as before, and only then does
closing a tab with unsent changes ask first. Otherwise there is nothing to
guard: the changes are on the device.

## Consequences

- An offline reload opens the workspace, says "Offline · as of 10:42", and keeps
  "Offline · 1 change waiting" until the connection is back.
- Workspace data rests on the device, unencrypted, until sign-out or 14 days.
  Anyone with the unlocked device, or script running on the app's origin, can
  read it. Such script could already read the page and call the API, so the
  new exposure is the device at rest. Sign out on a shared device.
- The session's token is never stored: it stays in the httpOnly cookie, and
  `e2e/no-token.spec.ts` checks that no stored value contains it.
- **Limit:** the Worker remembers the last 500 `opId`s. A batch left on a device
  while more than 500 later changes land elsewhere, then sent, would not be
  recognised as a duplicate. That can only happen if it was already applied
  but its answer never arrived. Within the 14 days of a session this is
  unlikely for one person, and it applies the same change again rather than
  losing one.

## Alternatives considered

| Option | Why not |
|---|---|
| `localStorage` | Synchronous, about 5 MB, strings only; a workspace snapshot can outgrow it, and every write blocks the page. |
| Keep only unsent changes | An offline reload would still show nothing to work on; the acceptance asks for the snapshot too. |
| Keep personal workspaces only | Considered and offered; the owner chose to keep work workspaces too, as their data is already sanitised. |
| Encrypt the copy | The key would have to live on the same device, readable by the same script; it adds cost without a real boundary. |
