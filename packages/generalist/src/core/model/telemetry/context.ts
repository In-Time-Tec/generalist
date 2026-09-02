import { Context, Effect } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import type { EventPayload, CallPurpose } from "./events.js"

/** The active loop's model-call telemetry seam. */
export interface Instrumentation {
  readonly emit: (event: EventPayload) => Effect.Effect<void>
  readonly wrap: (model: LanguageModel.Service) => LanguageModel.Service
}

/** The instrumentation of the enclosing agent run, when present. */
export const CurrentInstrumentation: Context.Reference<Instrumentation | undefined> = Context.Reference<
  Instrumentation | undefined
>("generalist/ModelTelemetry/CurrentInstrumentation", { defaultValue: () => undefined })

/** Purpose stamped onto model calls issued within the current region. */
export const CurrentPurpose: Context.Reference<CallPurpose> = Context.Reference<CallPurpose>(
  "generalist/ModelTelemetry/CurrentPurpose",
  { defaultValue: () => "conversation" },
)

/** Compaction pass identifier stamped onto model calls it issues. */
export const CurrentCompactionId: Context.Reference<string | undefined> = Context.Reference<string | undefined>(
  "generalist/ModelTelemetry/CurrentCompactionId",
  { defaultValue: () => undefined },
)

/** Mutable cell recording the model call a compaction pass issued for its summary. */
export interface SummaryCallCell {
  current: string | undefined
}

/** Cell a compaction pass provides to learn its summary model-call id. */
export const CurrentSummaryCall: Context.Reference<SummaryCallCell | undefined> = Context.Reference<
  SummaryCallCell | undefined
>("generalist/ModelTelemetry/CurrentSummaryCall", { defaultValue: () => undefined })
