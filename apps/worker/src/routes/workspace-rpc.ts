/**
 * workspace-rpc.ts — what the routes need from a workspace's Durable Object.
 * The Worker passes the real RPC stub; tests pass a fake.
 */

import type { AckOutcome, ApplyOutcome, ApplyRequest, FlushOutcome, ReadOutcome, RefreshOutcome, Snapshot } from '../engine.ts'
import type { ReadQuery } from '../queries.ts'

export interface WorkspaceRpc {
  apply(dir: string, request: ApplyRequest): Promise<ApplyOutcome>
  snapshot(dir: string): Promise<Snapshot>
  flush(dir: string): Promise<FlushOutcome>
  refresh(dir: string): Promise<RefreshOutcome>
  read(dir: string, query: ReadQuery): Promise<ReadOutcome>
  ackActivity(dir: string, cursor: string, upTo?: string): Promise<AckOutcome>
}
