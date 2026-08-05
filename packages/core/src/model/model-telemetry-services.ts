import { Context, Effect, Layer, Option, Schema } from "effect"
import { IdGenerator } from "effect/unstable/ai"
import type {
  DeliveryBatch,
  ModelInvocationCompleted,
  ModelInvocationFailed,
  ModelInvocationStarted,
} from "./model-telemetry.js"

/** @experimental */
export class InvocationCoordinationFailed extends Schema.TaggedErrorClass<InvocationCoordinationFailed>()(
  "@batonfx/core/InvocationCoordinationFailed",
  { message: Schema.String },
) {}

/** @experimental */
export interface InvocationCoordinatorInterface {
  readonly beforeAttempt: (input: ModelInvocationStarted) => Effect.Effect<void, InvocationCoordinationFailed>
  readonly completeAttempt: (input: ModelInvocationCompleted) => Effect.Effect<void, InvocationCoordinationFailed>
  readonly failAttempt: (input: ModelInvocationFailed) => Effect.Effect<void, InvocationCoordinationFailed>
}

/** @experimental */
export class InvocationCoordinator extends Context.Service<InvocationCoordinator, InvocationCoordinatorInterface>()(
  "@batonfx/core/InvocationCoordinator",
) {}

/** @experimental */
export const layerInvocationCoordinatorNoop: Layer.Layer<InvocationCoordinator> = Layer.succeed(
  InvocationCoordinator,
  InvocationCoordinator.of({
    beforeAttempt: () => Effect.void,
    completeAttempt: () => Effect.void,
    failAttempt: () => Effect.void,
  }),
)

/** @experimental */
export const isInvocationCoordinationFailed = Schema.is(InvocationCoordinationFailed)

/** @experimental Host telemetry delivery failure. A remote failure can be ambiguous; reconcile with the sink. */
export class DeliveryFailed extends Schema.TaggedErrorClass<DeliveryFailed>()("@batonfx/core/DeliveryFailed", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental Host sink for ordered, backpressured lifecycle delivery. Deduplicate by `(sessionId, deliveryId)`. */
export interface DeliveryInterface {
  readonly deliver: (batch: DeliveryBatch) => Effect.Effect<void, DeliveryFailed>
}

/** @experimental */
export class Delivery extends Context.Service<Delivery, DeliveryInterface>()("@batonfx/core/Delivery") {}

/** @experimental No-op host delivery sink. */
export const layerNoop: Layer.Layer<Delivery> = Layer.succeed(Delivery, Delivery.of({ deliver: () => Effect.void }))

/** @experimental Generate one telemetry identifier via `IdGenerator`, defaulting when absent. */
export const generateId: Effect.Effect<string> = Effect.flatMap(
  Effect.serviceOption(IdGenerator.IdGenerator),
  (service) => Option.getOrElse(service, () => IdGenerator.defaultIdGenerator).generateId(),
)
