import { Context, Effect, Layer, Ref, Schedule, Semaphore } from "effect"
import { ActiveExecutions } from "./active-executions.js"
import { AgentExecutionFailure } from "./errors.js"
import { ExecutionHost } from "./execution-host.js"
import { RunStore } from "./run-store.js"
import type { Interface as RunStoreInterface } from "./run-store.js"
import { isTerminal } from "./run.js"

export interface Options {
  readonly workerId: string
  readonly concurrency?: number
  readonly pollInterval?: import("effect").Duration.Input
}

export interface Interface {
  readonly tick: Effect.Effect<void, never, RunStore>
}

export class LocalScheduler extends Context.Service<LocalScheduler, Interface>()("@batonfx/runtime/LocalScheduler") {}

const terminalStatuses = ["succeeded", "failed", "cancelled"] as const
type TerminalStatus = (typeof terminalStatuses)[number]

export const make = (options: Options): Effect.Effect<Interface, never, RunStore | ExecutionHost | ActiveExecutions> =>
  Effect.gen(function* () {
    const host = yield* ExecutionHost
    const active = yield* ActiveExecutions
    const concurrency = options.concurrency ?? 4
    const tickLock = yield* Semaphore.make(1)
    const selectionWindow = Math.max(concurrency * 2, 16)
    const reconcileWindow = 32

    const watermarks = yield* Ref.make<Readonly<Record<TerminalStatus, string | undefined>>>({
      succeeded: undefined,
      failed: undefined,
      cancelled: undefined,
    })
    const retry = yield* Ref.make<ReadonlySet<string>>(new Set())

    type ReconcileOutcome = "done" | "retry"

    const setRetry = (runId: string, outcome: ReconcileOutcome) =>
      outcome === "retry"
        ? Ref.update(retry, (current) => (current.has(runId) ? current : new Set(current).add(runId)))
        : Ref.update(retry, (current) => {
            if (!current.has(runId)) return current
            const next = new Set(current)
            next.delete(runId)
            return next
          })

    const reconcileChild = (store: RunStoreInterface, runId: string): Effect.Effect<ReconcileOutcome> =>
      Effect.gen(function* () {
        const execution = yield* store.loadExecution(runId)
        const metadata = execution.message.metadata
        if (
          metadata?.runtimeChildTool !== true ||
          typeof metadata.parentRunId !== "string" ||
          typeof metadata.parentToolCallId !== "string"
        ) {
          return "done"
        }
        const parent = yield* store.inspect(metadata.parentRunId)
        if (parent.status === "cancelling" || parent.status === "cancelled") return "done"
        if (isTerminal(parent.status)) return "done"
        const wait = parent.wait
        if (wait?.waitId === metadata.parentToolCallId && wait.status === "responded") return "done"
        if (wait?.waitId !== metadata.parentToolCallId || wait.status !== "open") return "retry"
        const snapshot = yield* store.snapshot(runId)
        if (snapshot.outcome === undefined) return "retry"
        const result =
          snapshot.outcome._tag === "Succeeded"
            ? metadata.codeMode === true && "value" in snapshot.outcome.result
              ? snapshot.outcome.result.value
              : "text" in snapshot.outcome.result
                ? {
                    _tag: "Succeeded" as const,
                    childRunId: runId,
                    text: snapshot.outcome.result.text,
                    turns: snapshot.outcome.result.turns,
                  }
                : { _tag: "Failed" as const, childRunId: runId, message: "child resolved a non-Agent executable" }
            : snapshot.outcome._tag === "Failed"
              ? { _tag: "Failed" as const, childRunId: runId, message: snapshot.outcome.error.message }
              : {
                  _tag: "Cancelled" as const,
                  childRunId: runId,
                  ...(snapshot.outcome.reason === undefined ? {} : { reason: snapshot.outcome.reason }),
                }
        yield* store.resume({
          runId: metadata.parentRunId,
          waitId: metadata.parentToolCallId,
          resolution: { _tag: "ToolResult", result, encodedResult: result },
        })
        return "done"
      }).pipe(Effect.catch(() => Effect.succeed("retry" as const)))

    const processCandidate = (store: RunStoreInterface, runId: string) =>
      Effect.gen(function* () {
        const outcome = yield* reconcileChild(store, runId)
        yield* setRetry(runId, outcome)
      })

    const reconcileTerminalChildren = (store: RunStoreInterface) =>
      Effect.gen(function* () {
        const seen = new Set<string>()
        const retrySnapshot = yield* Ref.get(retry)
        for (const runId of retrySnapshot) {
          if (seen.has(runId)) continue
          seen.add(runId)
          yield* processCandidate(store, runId)
        }
        for (const status of terminalStatuses) {
          const recent = yield* store.list({ status, order: "newest", limit: reconcileWindow })
          for (const run of recent) {
            if (seen.has(run.runId)) continue
            seen.add(run.runId)
            if (run.parentRunId === undefined) continue
            yield* processCandidate(store, run.runId)
          }
        }
        for (const status of terminalStatuses) {
          const watermark = (yield* Ref.get(watermarks))[status]
          const batch = yield* store.list({
            status,
            order: "oldest",
            limit: reconcileWindow,
            ...(watermark === undefined ? {} : { afterRunId: watermark }),
          })
          for (const run of batch) {
            if (seen.has(run.runId)) continue
            seen.add(run.runId)
            if (run.parentRunId === undefined) continue
            yield* processCandidate(store, run.runId)
          }
          const last = batch[batch.length - 1]
          if (last !== undefined) {
            yield* Ref.update(watermarks, (current) =>
              current[status] === last.runId ? current : { ...current, [status]: last.runId },
            )
          }
        }
      })

    const sweepCancelling = (store: RunStoreInterface) =>
      Effect.gen(function* () {
        const cancelling = yield* store.list({ status: "cancelling", order: "oldest", limit: reconcileWindow })
        yield* Effect.forEach(cancelling, (run) => active.interrupt(run.runId), {
          concurrency: "unbounded",
          discard: true,
        })
        const stillActive = yield* active.active
        yield* Effect.forEach(
          cancelling,
          (run) =>
            stillActive.has(run.runId)
              ? Effect.void
              : store.loadExecution(run.runId).pipe(
                  Effect.flatMap((execution) => {
                    if (execution.ownerId === undefined) return store.cancel({ runId: run.runId })
                    if (execution.ownerId === options.workerId) return Effect.void
                    return store.fail({
                      runId: run.runId,
                      ownerId: execution.ownerId,
                      attemptFence: execution.attemptFence,
                      error: AgentExecutionFailure.make({ message: "execution interrupted" }),
                    })
                  }),
                  Effect.ignore,
                ),
          { concurrency, discard: true },
        )
      })

    const selectReadyRuns = (store: RunStoreInterface) =>
      Effect.gen(function* () {
        const running = yield* store.list({ status: "running", order: "oldest", limit: selectionWindow })
        const info = yield* store.info
        // Re-admitting a Run this process is already executing would fence out and interrupt that execution.
        const executing = yield* active.active
        const available = yield* Effect.filter(running, (run) =>
          executing.has(run.runId)
            ? Effect.succeed(false)
            : store
                .loadExecution(run.runId)
                .pipe(
                  Effect.map(
                    (execution) =>
                      info.backend === "sqlite" ||
                      execution.ownerId === undefined ||
                      execution.ownerId === options.workerId,
                  ),
                ),
        )
        yield* Effect.forEach(
          available.slice(0, concurrency),
          (run) =>
            store
              .claimExecution({ runId: run.runId, ownerId: options.workerId })
              .pipe(Effect.flatMap(host.execute), Effect.ignore),
          { concurrency, discard: true },
        )
      })

    const tick = Effect.gen(function* () {
      const store = yield* RunStore
      yield* reconcileTerminalChildren(store)
      yield* sweepCancelling(store)
      yield* selectReadyRuns(store)
    }).pipe(Effect.ignore, tickLock.withPermit)

    return LocalScheduler.of({ tick })
  })

export const layer = (
  options: Options,
): Layer.Layer<LocalScheduler, never, RunStore | ExecutionHost | ActiveExecutions> =>
  Layer.effect(
    LocalScheduler,
    Effect.gen(function* () {
      const scheduler = yield* make(options)
      const poll = options.pollInterval ?? "10 millis"
      yield* Effect.forkScoped(
        Effect.sleep(poll).pipe(Effect.andThen(scheduler.tick), Effect.repeat(Schedule.spaced(poll))),
      )
      return scheduler
    }),
  )
