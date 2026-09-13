import { Context, Effect, Option } from "effect"
import { Tool } from "effect/unstable/ai"
import type { CompletedModelResponse } from "../response/builder.js"

/** Identity of the authoritative provider attempt for one model operation. */
export interface AttemptIdentity {
  readonly operationKey?: string
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionParentId?: string | null
}

/** A normalized response that was interrupted after producing semantic content. */
export interface Snapshot extends AttemptIdentity {
  readonly response: CompletedModelResponse<Record<string, Tool.Any>>
}

/** Read-only access to the active model response owned by one Run. */
export interface Service {
  readonly snapshot: Effect.Effect<Option.Option<Snapshot>>
}

/** Run-owned access to the currently authoritative partial model response. */
export class ActiveModelResponse extends Context.Service<ActiveModelResponse, Service>()(
  "generalist/core/model/result/active-model-response/ActiveModelResponse",
) {}
