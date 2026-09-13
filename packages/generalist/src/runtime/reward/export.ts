import { Effect } from "effect"
import type { JournalReader } from "../../trajectory/index.js"
import type { DagRuntime } from "../../unstable/rl-export/index.js"
import {
  RewardConflict,
  RewardRunNotFound,
  RewardRuntimeUnavailable,
  RewardStorageFailed,
  type RewardWriteError,
  type RewardWriter,
} from "../../unstable/rl-export/reward-writer.js"
import type { RuntimeLifecycleService } from "../state/layer.js"
import type { Service as RunStore } from "../run/store.js"

const bindings = new WeakMap<object, DagRuntime>()

export const bind = (input: {
  readonly runtime: object
  readonly journal: JournalReader
  readonly store: RunStore
  readonly lifecycle: RuntimeLifecycleService
}): void => {
  const record: RewardWriter["record"] = (received) =>
    Effect.suspend(() => {
      const command = {
        commandId: received.commandId,
        runId: received.runId,
        leaf: received.leaf,
        value: received.value,
        source: received.source,
      }
      return input.lifecycle.run(input.store.recordReward(command)).pipe(
        Effect.catch((error): Effect.Effect<void, RewardWriteError> => {
          switch (error._tag) {
            case "generalist/runtime/RunNotFound":
              return Effect.fail(RewardRunNotFound.make({ runId: command.runId }))
            case "generalist/runtime/RuntimeUnavailable":
            case "generalist/runtime/RuntimeOwnershipLost":
            case "generalist/runtime/RuntimeRetired":
              return Effect.fail(
                RewardRuntimeUnavailable.make({
                  commandId: command.commandId,
                  message:
                    error._tag === "generalist/runtime/RuntimeUnavailable" &&
                    error.message === "Canonical reward-command provenance is missing for this namespace"
                      ? error.message
                      : "Runtime is unavailable for reward recording",
                }),
              )
            case "generalist/durability/DurabilityFailure":
              if (error.reason === "input-conflict") {
                return input.store.lookupRewardCommand(command.commandId).pipe(
                  Effect.mapError((lookupError) =>
                    lookupError._tag === "generalist/runtime/RuntimeUnavailable"
                      ? RewardRuntimeUnavailable.make({
                          commandId: command.commandId,
                          message: "Runtime is unavailable for reward reconciliation",
                        })
                      : RewardStorageFailed.make({
                          commandId: command.commandId,
                          operation: "record-reward",
                          message: "Canonical reward-command provenance could not be read",
                        }),
                  ),
                  Effect.flatMap((existing): Effect.Effect<never, RewardConflict | RewardRuntimeUnavailable> =>
                    existing === undefined
                      ? Effect.fail(
                          RewardRuntimeUnavailable.make({
                            commandId: command.commandId,
                            message: "Canonical reward-command provenance is unavailable",
                          }),
                        )
                      : Effect.fail(
                          RewardConflict.make({
                            commandId: command.commandId,
                            existing,
                            received: {
                              runId: command.runId,
                              leaf: command.leaf,
                              value: command.value,
                              source: command.source,
                            },
                          }),
                        ),
                  ),
                )
              }
              return Effect.fail(
                RewardStorageFailed.make({
                  commandId: command.commandId,
                  operation: "record-reward",
                  message: "Canonical storage could not establish the reward command result",
                }),
              )
            case "generalist/runtime/PayloadTooLarge":
              return Effect.fail(
                RewardStorageFailed.make({
                  commandId: command.commandId,
                  operation: "record-reward",
                  message: "The reward exceeds the Runtime storage bounds",
                }),
              )
          }
        }),
      )
    })
  bindings.set(
    input.runtime,
    Object.freeze({
      snapshot: input.journal.snapshot,
      history: input.journal.history,
      sessionEntry: input.journal.sessionEntry,
      resolveModelResponse: input.journal.resolveModelResponse,
      rewards: Object.freeze({ record }),
    }),
  )
}

export const get = (runtime: object): DagRuntime | undefined => bindings.get(runtime)

export const copy = <Runtime extends object>(input: { readonly source: object; readonly target: Runtime }): Runtime => {
  const capability = bindings.get(input.source)
  if (capability !== undefined) bindings.set(input.target, capability)
  return input.target
}
