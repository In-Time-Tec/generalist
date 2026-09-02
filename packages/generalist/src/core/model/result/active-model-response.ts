import { Context, Effect, Option } from "effect"
import { Tool } from "effect/unstable/ai"
import type { CompletedModelResponse } from "../response/builder.js"
import { install, make as makeWriterState } from "./active-model-response-writer.js"

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

const HandleTypeId: unique symbol = Symbol.for("generalist/ActiveModelResponse/Handle")

/** Read-only access to the active model response owned by one Run. */
export interface Service {
  readonly [HandleTypeId]: typeof HandleTypeId
  readonly snapshot: Effect.Effect<Option.Option<Snapshot>>
}

/** Run-owned access to the currently authoritative partial model response. */
export class ActiveModelResponse extends Context.Service<ActiveModelResponse, Service>()(
  "generalist/core/model/result/active-model-response/ActiveModelResponse",
) {}

/** Make one opaque accumulator handle for a single Run. */
export const make = (): Service => {
  const state = makeWriterState()
  const service = ActiveModelResponse.of({
    [HandleTypeId]: HandleTypeId,
    snapshot: state.snapshot,
  })
  install({ service, writer: state.writer })
  return service
}
