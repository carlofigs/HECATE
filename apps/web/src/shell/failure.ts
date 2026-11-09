import type { Failure } from '../api.ts'

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * What went wrong, why, and what to do next (R-27), for each way a load can
 * fail. `what` names the thing with its article: "the workspace “Work”",
 * "your workspaces".
 */
export function describeFailure(failure: Failure, what: string): { title: string; detail: string; retry: boolean } {
  switch (failure.kind) {
    case 'network':
      return { title: "Can't reach HECATE", detail: 'This device seems to be offline, or the connection dropped. Check the connection, then try again.', retry: true }
    case 'unavailable':
      return { title: `HECATE can't load ${what} right now`, detail: `${failure.message}. Try again in a minute; if it keeps happening, check the Worker's logs.`, retry: true }
    case 'not-found':
      return { title: `${capitalise(what)} doesn't exist`, detail: 'It may have been renamed or removed in the data repository. Pick another workspace.', retry: false }
    case 'signed-out':
      return { title: 'You are signed out', detail: 'Your session ended. Sign in again to continue.', retry: false }
    case 'unexpected':
      return { title: 'Something went wrong', detail: `HECATE answered ${failure.status}: ${failure.message}. Try again; if it keeps happening, check the Worker's logs.`, retry: true }
  }
}
