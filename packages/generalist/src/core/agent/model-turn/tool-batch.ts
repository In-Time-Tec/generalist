import { Effect, Schema, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import { AgentSuspended, type Event } from "../event.js"
import type { AnyToolCall, PendingToolResult } from "../tools/result.js"
import type { ToolSchedulingPolicy } from "../service.js"
import { schedule } from "../tools/scheduler.js"
import { make, projectableResults, waits } from "../tools/checkpoint.js"
import { operationKey } from "../../durable/driver/interpreter.js"
import { checkpoint, logicalOperationId, setToolBatch } from "../../durable/driver/run.js"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import { DriverStateInvalid } from "../../durable/service.js"
import { promptDigest } from "../prompt-identity.js"

export interface ToolExecution {
  readonly call: AnyToolCall
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly toolCallIndex: number
}

/** Schedule one newly authored batch and persist each safe stage checkpoint before advancing. */
export const scheduleBatch = <E, R>(input: {
  readonly turn: number
  readonly calls: ReadonlyArray<AnyToolCall>
  readonly executions: ReadonlyArray<ToolExecution>
  readonly toolScheduling: ToolSchedulingPolicy
  readonly activeTools: ReadonlyArray<string>
  readonly authorizationMessages: ReadonlyArray<Prompt.Message>
  readonly pending: Map<number, PendingToolResult>
  readonly execute: (execution: ToolExecution) => Stream.Stream<Event, E, R>
}) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const logicalId = yield* logicalOperationId
      const initial = yield* checkpoint
      const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(initial.state).pipe(
        Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
      )
      const batch = make({
        turn: input.turn,
        calls: input.calls,
        operationKeys: input.calls.map((call) => operationKey(logicalId, "tool", input.turn, call.id, call.name)),
        activeTools: input.activeTools,
        authorizationContextDigest: promptDigest(input.authorizationMessages),
        argumentTaint: state.capabilities?.taint ?? [],
      })
      yield* setToolBatch(batch)
      return schedule(input.executions, input.toolScheduling, {
        execute: input.execute,
        afterStage: () =>
          Effect.gen(function* () {
            const current = yield* checkpoint
            const driverState = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
              Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
            )
            if (driverState.toolBatch === undefined) return
            for (const [index, result] of projectableResults(
              driverState.toolBatch,
              new Set(),
              new Set(input.pending.keys()),
            )) {
              input.pending.set(index, result)
            }
            const openWaits = waits(driverState.toolBatch)
            if (openWaits.length > 0) {
              return yield* AgentSuspended.make({ checkpoint: driverState.toolBatch, waits: openWaits })
            }
          }),
      })
    }),
  )
