import { Context, Effect, Layer, Ref, Schema } from "effect"
import { HarnessScope } from "./entry.js"
import { HarnessState, empty } from "./state.js"

/** @experimental Why one harness store operation failed. */
export const HarnessStoreRejection = Schema.Literals(["corrupt", "encode", "unreadable", "unwritable"])
/** @experimental */
export type HarnessStoreRejection = typeof HarnessStoreRejection.Type

/** @experimental A harness store operation failed. */
export class HarnessStoreError extends Schema.TaggedErrorClass<HarnessStoreError>()(
  "@batonfx/harness/HarnessStoreError",
  {
    reason: HarnessStoreRejection,
    scope: Schema.String,
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

/** @experimental Durable continual-harness state seam, keyed by scope. */
export interface Interface {
  readonly load: (scope: HarnessScope) => Effect.Effect<HarnessState, HarnessStoreError>
  readonly save: (state: HarnessState) => Effect.Effect<void, HarnessStoreError>
}

/** @experimental */
export class HarnessStore extends Context.Service<HarnessStore, Interface>()(
  "@batonfx/harness/harness/store/HarnessStore",
) {}

/** @experimental An in-process store that starts empty and never persists beyond its own scope. */
export const layerMemory: Layer.Layer<HarnessStore> = Layer.effect(
  HarnessStore,
  Ref.make(new Map<string, HarnessState>()).pipe(
    Effect.map((states) =>
      HarnessStore.of({
        load: (scope) => Ref.get(states).pipe(Effect.map((current) => current.get(scope) ?? empty(scope))),
        save: (state) => Ref.update(states, (current) => new Map(current).set(state.scope, state)).pipe(Effect.asVoid),
      }),
    ),
  ),
)

/** @experimental */
export const layerTest = (implementation: Interface): Layer.Layer<HarnessStore> =>
  Layer.succeed(HarnessStore, HarnessStore.of(implementation))
