import { Effect, Function, Schema } from "effect"
import { AwaitEventResult } from "../../../../core/agent/tools/wake-event.js"
import { RuntimeUnavailable } from "../../../errors.js"
import { occurredAt, type PreparedObservation } from "../../observation.js"
import { appendLifecycle, resumedEvent } from "../../append.js"
import { openRunWaits, type RuntimeState } from "../../projection.js"
import { closeWait } from "./wait.js"

type ReconcileRunWaits = Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>

export const reconcileRunWaits: {
  (runId: string): (state: RuntimeState) => ReconcileRunWaits
  (state: RuntimeState, runId: string): ReconcileRunWaits
} = Function.dual(2, (state: RuntimeState, runId: string) => reconcileRunWaitsInternal(state, runId))

const reconcileRunWaitsInternal = (state: RuntimeState, runId: string) =>
  Effect.gen(function* () {
    let next = state
    for (const wait of openRunWaits(next, runId)) {
      if (wait.reason._tag !== "AwaitEvent" || wait.reason.filter._tag !== "Run") continue
      const run = next.runs.get(runId)!
      if (run.cancellationRequested) continue
      const selector = wait.reason.filter
      const receipt = Array.from(next.waits.entries()).find(
        ([key, prior]) =>
          key.startsWith(`${runId}\0`) &&
          prior.waitId !== wait.waitId &&
          prior.status === "responded" &&
          prior.reason._tag === "AwaitEvent" &&
          prior.reason.filter._tag === "Run" &&
          prior.reason.filter.commandId === selector.commandId,
      )?.[1].resolution
      const message =
        receipt === undefined && selector.messages
          ? run.steering.find((entry) => entry.consumedOperationId === undefined && entry.discardedReason === undefined)
          : undefined
      let result: AwaitEventResult | undefined
      if (message !== undefined) {
        result = { _tag: "Message", messageId: message.entryId, input: message.prompt, cursor: message.sequence }
      } else {
        const settled = selector.runs
          .flatMap((targetId) => {
            const target = next.runs.get(targetId)
            if (target === undefined || target.rootRunId !== run.rootRunId) return []
            const terminal = target.events.find(
              (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
            )
            return terminal === undefined ? [] : [{ runId: targetId, terminal }]
          })
          .toSorted(
            (left, right) => left.terminal.sequence - right.terminal.sequence || left.runId.localeCompare(right.runId),
          )[0]
        if (settled !== undefined)
          result = { _tag: "RunSettled", runId: settled.runId, terminalEventId: settled.terminal.eventId }
      }
      if (result === undefined && receipt === undefined) continue
      const resolution = receipt ?? {
        _tag: "ToolResult" as const,
        result: result!,
        encodedResult: yield* Schema.encodeEffect(AwaitEventResult)(result!).pipe(
          Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
        ),
      }
      const closed = closeWait(next, {
        runId,
        waitId: wait.waitId,
        status: "responded",
        resolution,
        closedAt: yield* occurredAt,
      })
      if (closed.affected !== 1) continue
      next = closed.state
      if (message !== undefined) {
        const runs = new Map(next.runs)
        runs.set(runId, {
          ...run,
          steering: run.steering.map((entry) =>
            entry.entryId === message.entryId ? { ...entry, consumedOperationId: wait.waitId } : entry,
          ),
        })
        next = { ...next, runs }
        ;[, next] = yield* appendLifecycle(next, runId, {
          _tag: "SteeringConsumed",
          entryIds: [message.entryId],
          operationId: wait.waitId,
        })
      }
      ;[, next] = yield* appendLifecycle(next, runId, resumedEvent(wait.waitId, resolution), "running")
    }
    return next
  })
