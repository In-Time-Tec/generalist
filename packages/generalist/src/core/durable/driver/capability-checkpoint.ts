import { Effect, Ref, Schema, Semaphore } from "effect"
import type { ToolBatchCheckpoint } from "../../agent/tools/checkpoint.js"
import type { Checkpoint as CapabilityCheckpoint } from "../../capability/state.js"
import type { DriverCheckpoint } from "./contract.js"
import { LoopDriverState } from "../loop-driver-state.js"
import { DriverError, DriverStateInvalid } from "../service.js"

export interface CapabilityCheckpointService {
  readonly toolBatchCheckpoint: Effect.Effect<ToolBatchCheckpoint | undefined, DriverStateInvalid>
  readonly capabilityCheckpoint: Effect.Effect<CapabilityCheckpoint | undefined, DriverStateInvalid>
  readonly updateCapabilityCheckpoint: <A>(
    update: (checkpoint: CapabilityCheckpoint | undefined) => {
      readonly checkpoint: CapabilityCheckpoint
      readonly value: A
    },
  ) => Effect.Effect<A, DriverError | DriverStateInvalid>
}

/** @internal Persist capability decisions in the run checkpoint that owns their tool-call batch. */
export const capabilityCheckpointMethods = (input: {
  readonly checkpointRef: Ref.Ref<DriverCheckpoint>
  readonly commitSemaphore: Semaphore.Semaphore
  readonly onCheckpoint: (checkpoint: DriverCheckpoint) => Effect.Effect<void, DriverError>
}): CapabilityCheckpointService => {
  const state = Ref.get(input.checkpointRef).pipe(
    Effect.flatMap((current) => Schema.decodeUnknownEffect(LoopDriverState)(current.state)),
    Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
  )
  return {
    toolBatchCheckpoint: state.pipe(Effect.map((current) => current.toolBatch)),
    capabilityCheckpoint: state.pipe(Effect.map((current) => current.capabilities)),
    updateCapabilityCheckpoint: (update) =>
      input.commitSemaphore.withPermit(
        Effect.gen(function* () {
          const current = yield* Ref.get(input.checkpointRef)
          const decoded = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
            Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
          )
          const updated = update(decoded.capabilities)
          const next = { ...current, state: { ...decoded, capabilities: updated.checkpoint } }
          yield* Ref.set(input.checkpointRef, next)
          yield* input.onCheckpoint(next)
          return updated.value
        }),
      ),
  }
}
