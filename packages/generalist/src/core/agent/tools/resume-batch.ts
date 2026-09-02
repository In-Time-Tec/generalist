import { Effect, Schema, Stream } from "effect"
import { Response } from "effect/unstable/ai"
import { AgentError, AgentSuspended, type Event } from "../event.js"
import type { RunError, ToolSchedulingPolicy } from "../service.js"
import { resolvedToolResult } from "../suspension.js"
import { checkpoint as driverCheckpoint, updateToolBatch } from "../../durable/driver/run.js"
import type { DriverInterpreter } from "../../durable/driver/interpreter.js"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import { DriverStateInvalid } from "../../durable/service.js"
import type { Registry } from "../../tools/tool-registry.js"
import type { Request } from "../../tools/tool-executor.js"
import {
  completed,
  effectiveCall,
  pendingResult,
  resolutionFor,
  updateCall,
  waits,
  type ToolBatchCheckpoint,
  type ToolBatchResolution,
} from "./checkpoint.js"
import type { AnyToolCall } from "./result.js"
import { schedule } from "./scheduler.js"

interface ResumedExecution {
  readonly call: AnyToolCall
  readonly entry: ToolBatchCheckpoint["calls"][number]
  readonly toolCallIndex: number
}

/** @internal Resume one authoritative batch through the same scheduling and execution paths as a fresh batch. */
export const resumeBatch = <R, R2>(input: {
  readonly checkpoint: ToolBatchCheckpoint
  readonly messages: ReadonlyArray<import("effect/unstable/ai").Prompt.Message>
  readonly resolutions: ReadonlyArray<ToolBatchResolution>
  readonly registry: Registry
  readonly toolScheduling: ToolSchedulingPolicy
  readonly emitCompleted?: boolean
  readonly toolCallEvents: (
    turn: number,
    batch: Request["toolCallBatch"],
    index: number,
    call: AnyToolCall,
    messages: ReadonlyArray<import("effect/unstable/ai").Prompt.Message>,
    registry: Registry,
  ) => Stream.Stream<Event, RunError, R>
  readonly resumeApproved: (
    turn: number,
    batch: Request["toolCallBatch"],
    index: number,
    call: AnyToolCall,
    registry: Registry,
  ) => Stream.Stream<Event, RunError, R>
  readonly transformResolved: (
    turn: number,
    batch: Request["toolCallBatch"],
    index: number,
    call: AnyToolCall,
    result: import("./result.js").PendingToolResult,
  ) => Effect.Effect<import("./result.js").PendingToolResult, RunError, R>
  readonly onCheckpoint: (checkpoint: ToolBatchCheckpoint) => Effect.Effect<void, RunError, R2>
}): Stream.Stream<Event, RunError, R | R2 | DriverInterpreter> => {
  const turn = input.checkpoint.turn
  const calls = input.checkpoint.calls.map((entry) => {
    const call = effectiveCall(entry)
    return Response.makePart("tool-call", {
      id: call.id,
      name: call.name,
      params: call.params,
      providerExecuted: call.providerExecuted,
      metadata: call.metadata,
    })
  })
  const toolCallBatch: Request["toolCallBatch"] = { calls }
  const executions: ReadonlyArray<ResumedExecution> = input.checkpoint.calls.flatMap((entry, toolCallIndex) => {
    const call = calls[toolCallIndex]
    return call === undefined ? [] : [{ call, entry, toolCallIndex }]
  })
  const execute = ({
    call,
    entry,
    toolCallIndex,
  }: ResumedExecution): Stream.Stream<Event, RunError, R | DriverInterpreter> => {
    if (entry.state._tag === "Completed") {
      if (input.emitCompleted !== true) return Stream.empty
      const result = pendingResult(entry.state.result)
      return Stream.succeed({ _tag: "ToolExecutionCompleted", turn, call, result })
    }
    if (entry.state._tag === "Unknown" || entry.state._tag === "Cancelled") {
      return Stream.fail(
        AgentError.make({ message: `Tool call ${call.id} is ${entry.state._tag.toLowerCase()}`, turn }),
      )
    }
    if (entry.state._tag === "Waiting") {
      const resolution = resolutionFor(input.resolutions, entry.state.waitId)
      if (resolution === undefined) return Stream.empty
      if (resolution._tag === "Approved") {
        return Stream.unwrap(
          updateToolBatch((current) =>
            updateCall(current, {
              callIndex: toolCallIndex,
              state: { _tag: "Ready", stage: "execution" },
            }),
          ).pipe(Effect.map(() => input.resumeApproved(turn, toolCallBatch, toolCallIndex, call, input.registry))),
        )
      }
      return Stream.fromEffect(
        Effect.gen(function* () {
          const result = yield* input.transformResolved(
            turn,
            toolCallBatch,
            toolCallIndex,
            call,
            resolvedToolResult(call, resolution),
          )
          yield* updateToolBatch((current) => completed(current, toolCallIndex, result))
          return { _tag: "ToolExecutionCompleted" as const, turn, call, result }
        }),
      )
    }
    if (entry.state._tag === "Scheduled" || entry.state.stage === "execution") {
      return input.resumeApproved(turn, toolCallBatch, toolCallIndex, call, input.registry)
    }
    return input.toolCallEvents(turn, toolCallBatch, toolCallIndex, call, input.messages, input.registry)
  }
  return schedule(executions, input.toolScheduling, {
    execute,
    afterStage: () =>
      Effect.gen(function* () {
        const current = yield* driverCheckpoint
        const driverState = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
          Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
        )
        if (driverState.toolBatch === undefined) return
        yield* input.onCheckpoint(driverState.toolBatch)
        const openWaits = waits(driverState.toolBatch)
        if (openWaits.length > 0) {
          return yield* AgentSuspended.make({ checkpoint: driverState.toolBatch, waits: openWaits })
        }
      }),
  })
}
