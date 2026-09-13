import { Schema } from "effect"
import { Result as GateResult } from "../../../core/agent/gates/definition.js"
import { Remaining as RemainingBudget } from "../../../core/durable/run-budget.js"
import { ChildReadiness } from "../../child/readiness.js"
import { RawUsageFact, RunInspectionFields, RunOutcome, RunStatus } from "../../run.js"
import { AgentLoopEventSchema } from "../../run/event.js"
import type { RuntimeInspection } from "../../engine.js"
import { isInspectionEvent } from "../agent/event.js"
import { ExecutionSuspension } from "../state.js"

const InspectionLastEvent = AgentLoopEventSchema.pipe(Schema.refine(isInspectionEvent))

export const ChildInspectionResponse = Schema.Struct({
  childRunId: Schema.String,
  status: RunStatus,
  readiness: ChildReadiness,
  invocationId: Schema.optionalKey(Schema.String),
  origin: Schema.optionalKey(Schema.Struct({ operationKey: Schema.String, ordinal: Schema.Finite })),
  outcome: Schema.optionalKey(RunOutcome),
})

export const RuntimeInspectionResponse = Schema.Struct({
  ...RunInspectionFields,
  revision: Schema.optionalKey(Schema.String),
  waitOpenedAtSequence: Schema.Record(Schema.String, Schema.Int),
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  usage: Schema.Struct({ inputTokens: Schema.Finite, outputTokens: Schema.Finite }),
  usageFacts: Schema.Array(RawUsageFact),
  activeTools: Schema.Array(Schema.String),
  lastEvent: Schema.optionalKey(InspectionLastEvent),
  elapsed: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  budget: RemainingBudget,
  gates: Schema.Array(GateResult),
  children: Schema.Array(ChildInspectionResponse),
  suspension: Schema.optionalKey(ExecutionSuspension),
}) satisfies Schema.Codec<RuntimeInspection, unknown>
