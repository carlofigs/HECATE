/**
 * workspace-rpc.ts — what the routes need from a workspace's Durable Object.
 * The Worker passes the real RPC stub; tests pass a fake.
 */

import type { ApplyOutcome, ApplyRequest, FlushOutcome, RefreshOutcome, Snapshot } from '../engine.ts'

export interface WorkspaceRpc {
  apply(dir: string, request: ApplyRequest): Promise<ApplyOutcome>
  snapshot(dir: string): Promise<Snapshot>
  flush(dir: string): Promise<FlushOutcome>
  refresh(dir: string): Promise<RefreshOutcome>
}
