import { Context, Effect } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import type { EventPayload, ModelCallPurpose } from "./model-telemetry.js"

/** @experimental The active loop's model-call telemetry seam. */
export interface Instrumentation {
  readonly emit: (event: EventPayload) => Effect.Effect<void>
  readonly wrap: (model: LanguageModel.Service) => LanguageModel.Service
}

/** @experimental The instrumentation of the enclosing agent run, when present. */
export const CurrentInstrumentation: Context.Reference<Instrumentation | undefined> = Context.Reference<
  Instrumentation | undefined
>("@batonfx/core/ModelTelemetry/CurrentInstrumentation", { defaultValue: () => undefined })

/** @experimental Purpose stamped onto model calls issued within the current region. */
export const CurrentPurpose: Context.Reference<ModelCallPurpose> = Context.Reference<ModelCallPurpose>(
  "@batonfx/core/ModelTelemetry/CurrentPurpose",
  { defaultValue: () => "conversation" },
)

/** @experimental Compaction pass identifier stamped onto model calls it issues. */
export const CurrentCompactionId: Context.Reference<string | undefined> = Context.Reference<string | undefined>(
  "@batonfx/core/ModelTelemetry/CurrentCompactionId",
  { defaultValue: () => undefined },
)

/** @experimental Mutable cell recording the model call a compaction pass issued for its summary. */
export interface SummaryCallCell {
  current: string | undefined
}

/** @experimental Cell a compaction pass provides to learn its summary model-call id. */
export const CurrentSummaryCall: Context.Reference<SummaryCallCell | undefined> = Context.Reference<
  SummaryCallCell | undefined
>("@batonfx/core/ModelTelemetry/CurrentSummaryCall", { defaultValue: () => undefined })
