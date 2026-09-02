import { Context, Effect, Layer, Ref, Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import { GuidanceScope } from "./entry.js"
import { GuidanceState, empty } from "./state.js"

/** Why one guidance store operation failed. */
export const StoreRejection = Schema.Literals(["corrupt", "encode", "unreadable", "unwritable"])
export type StoreRejection = typeof StoreRejection.Type

/** A guidance store operation failed. */
export class StoreError extends ActionableTaggedError<StoreError>()("generalist/instructions/StoreError", {
  reason: StoreRejection,
  scope: Schema.String,
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
  hint: errorHint("Inspect reason and cause, restore access to this guidance scope, then retry."),
}) {}

/** Durable instruction state seam, keyed by scope. */
export interface Service {
  readonly load: (scope: GuidanceScope) => Effect.Effect<GuidanceState, StoreError>
  readonly save: (state: GuidanceState) => Effect.Effect<void, StoreError>
}
export class Store extends Context.Service<Store, Service>()("generalist/instructions/store") {}

/** An in-process store that starts empty and never persists beyond its own scope. */
export const layerMemory: Layer.Layer<Store> = Layer.effect(
  Store,
  Ref.make(new Map<string, GuidanceState>()).pipe(
    Effect.map((states) =>
      Store.of({
        load: (scope) => Ref.get(states).pipe(Effect.map((current) => current.get(scope) ?? empty(scope))),
        save: (state) => Ref.update(states, (current) => new Map(current).set(state.scope, state)).pipe(Effect.asVoid),
      }),
    ),
  ),
)
export const layerTest = (implementation: Service): Layer.Layer<Store> => Layer.succeed(Store, Store.of(implementation))
