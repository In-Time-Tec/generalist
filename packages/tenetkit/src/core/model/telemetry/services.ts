import { Context, Effect, Layer, Option, Schema } from "effect"
import { IdGenerator } from "effect/unstable/ai"
import type {
  DeliveryBatch,
  ModelInvocationCompleted,
  ModelInvocationFailed,
  ModelInvocationStarted,
} from "./events.js"

/** @experimental */
export class InvocationLifecycleFailed extends Schema.TaggedError<InvocationLifecycleFailed>()(
  "tenetkit/core/InvocationLifecycleFailed",
  { message: Schema.String },
) {}

/** @experimental */
export class InvocationLifecycle extends Context.Service<
  InvocationLifecycle,
  {
    readonly beforeAttempt: (input: ModelInvocationStarted) => Effect.Effect<void, InvocationLifecycleFailed>
    readonly completeAttempt: (input: ModelInvocationCompleted) => Effect.Effect<void, InvocationLifecycleFailed>
    readonly failAttempt: (input: ModelInvocationFailed) => Effect.Effect<void, InvocationLifecycleFailed>
  }
>()("tenetkit/core/model/telemetry/services/InvocationLifecycle") {}

/** @experimental */
export const layerInvocationLifecycleNoop: Layer.Layer<InvocationLifecycle> = Layer.succeed(
  InvocationLifecycle,
  InvocationLifecycle.of({
    beforeAttempt: () => Effect.void,
    completeAttempt: () => Effect.void,
    failAttempt: () => Effect.void,
  }),
)

/** @experimental */
export const isInvocationLifecycleFailed = Schema.is(InvocationLifecycleFailed)

/** @experimental Host telemetry delivery failure. A remote failure can be ambiguous; reconcile with the sink. */
export class SinkFailed extends Schema.TaggedError<SinkFailed>()("tenetkit/core/SinkFailed", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental Host sink for ordered, backpressured lifecycle delivery. Deduplicate by `(sessionId, deliveryId)`. */
export class Sink extends Context.Service<
  Sink,
  {
    readonly deliver: (batch: DeliveryBatch) => Effect.Effect<void, SinkFailed>
  }
>()("tenetkit/core/model/telemetry/services/Sink") {}

/** @experimental No-op host delivery sink. */
export const layerSinkNoop: Layer.Layer<Sink> = Layer.succeed(Sink, Sink.of({ deliver: () => Effect.void }))

/** @experimental Generate one telemetry identifier via `IdGenerator`, defaulting when absent. */
export const generateId: Effect.Effect<string> = Effect.flatMap(
  Effect.serviceOption(IdGenerator.IdGenerator),
  (service) => Option.getOrElse(service, () => IdGenerator.defaultIdGenerator).generateId(),
)
