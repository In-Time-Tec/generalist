import { DateTime, Effect, Function } from "effect"
import { matches, type AwaitEventResult, type WakeEvent } from "../../../../core/agent/tools/wake-event.js"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../../errors.js"
import { isTerminal } from "../../../run.js"
import type { RunWait, WaitResolution } from "../../../run/wait.js"
import type { DueAwaitEvent, WakeDisposition } from "../../../execution/trigger/wake.js"
import { appendLifecycle, resumedEvent } from "../../append.js"
import { openRunWaits, waitMapKey, type MemoryState } from "../../state.js"
import { closeWait } from "../control/wait.js"

const receiptKey = (runId: string, dedupeKey: string): string => `${runId}\0${dedupeKey}`

const requireRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  if (run === undefined) return Effect.fail(RunNotFound.make({ runId }))
  if (isTerminal(run.status)) return Effect.fail(RunTerminal.make({ runId, status: run.status }))
  return Effect.succeed(run)
}

const eventResolution = (event: WakeEvent): WaitResolution => {
  const result: AwaitEventResult = { _tag: "Event", event }
  return { _tag: "ToolResult", result, encodedResult: result }
}

const timeoutResolution = (deadline: string): WaitResolution => {
  const result: AwaitEventResult = { _tag: "TimedOut", deadline }
  return { _tag: "ToolResult", result, encodedResult: result }
}

const matchingWait = (state: MemoryState, runId: string, event: WakeEvent): RunWait | undefined =>
  openRunWaits(state, runId).find((wait) => wait.reason._tag === "AwaitEvent" && matches(wait.reason.filter, event))

interface WakeInput {
  readonly runId: string
  readonly event: WakeEvent
  readonly now: number
}

export const wake: {
  (
    input: WakeInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<readonly [WakeDisposition, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
  (
    state: MemoryState,
    input: WakeInput,
  ): Effect.Effect<readonly [WakeDisposition, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: WakeInput) =>
  Effect.gen(function* () {
    yield* requireRun(state, input.runId)
    const key = receiptKey(input.runId, input.event.dedupeKey)
    if (state.wakeEvents.has(key)) {
      const [, duplicate] = yield* appendLifecycle(state, input.runId, {
        _tag: "Duplicate",
        dedupeKey: input.event.dedupeKey,
      })
      return [{ _tag: "Duplicate" }, duplicate] as const
    }
    const wakeEvents = new Map(state.wakeEvents).set(key, input.event)
    const [, received] = yield* appendLifecycle({ ...state, wakeEvents }, input.runId, {
      _tag: "WakeReceived",
      event: input.event,
    })
    const wait = matchingWait(received, input.runId, input.event)
    if (wait === undefined) return [{ _tag: "Ignored" }, received] as const
    const closedAt = DateTime.formatIso(DateTime.makeUnsafe(input.now))
    const resolution = eventResolution(input.event)
    const transitioned = closeWait(received, {
      runId: input.runId,
      waitId: wait.waitId,
      status: "responded",
      resolution,
      closedAt,
    })
    if (transitioned.affected !== 1) return [{ _tag: "Ignored" }, transitioned.state] as const
    const [, resumed] = yield* appendLifecycle(
      transitioned.state,
      input.runId,
      resumedEvent(wait.waitId, resolution),
      "running",
    )
    return [{ _tag: "Resumed", waitId: wait.waitId }, resumed] as const
  }),
)

export const dueAwaitEvents: {
  (input: { readonly now: number; readonly limit: number }): (state: MemoryState) => ReadonlyArray<DueAwaitEvent>
  (state: MemoryState, input: { readonly now: number; readonly limit: number }): ReadonlyArray<DueAwaitEvent>
} = Function.dual(2, (state: MemoryState, input: { readonly now: number; readonly limit: number }) => {
  const due: Array<DueAwaitEvent> = []
  for (const [key, wait] of state.waits.entries()) {
    if (due.length >= input.limit || wait.status !== "open" || wait.reason._tag !== "AwaitEvent") continue
    if (DateTime.toEpochMillis(DateTime.makeUnsafe(wait.reason.deadline)) > input.now) continue
    const separator = key.indexOf("\0")
    if (separator < 0) continue
    due.push({ runId: key.slice(0, separator), waitId: wait.waitId, deadline: wait.reason.deadline })
  }
  return due
})

type TimeoutAwaitEventInput = DueAwaitEvent & { readonly now: number }

export const timeoutAwaitEvent: {
  (
    input: TimeoutAwaitEventInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<readonly [boolean, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
  (
    state: MemoryState,
    input: TimeoutAwaitEventInput,
  ): Effect.Effect<readonly [boolean, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: TimeoutAwaitEventInput) =>
  Effect.gen(function* () {
    yield* requireRun(state, input.runId)
    const wait = state.waits.get(waitMapKey(input.runId, input.waitId))
    if (
      wait?.status !== "open" ||
      wait.reason._tag !== "AwaitEvent" ||
      wait.reason.deadline !== input.deadline ||
      DateTime.toEpochMillis(DateTime.makeUnsafe(wait.reason.deadline)) > input.now
    ) {
      return [false, state] as const
    }
    const resolution = timeoutResolution(input.deadline)
    const transitioned = closeWait(state, {
      runId: input.runId,
      waitId: input.waitId,
      status: "responded",
      resolution,
      closedAt: DateTime.formatIso(DateTime.makeUnsafe(input.now)),
    })
    if (transitioned.affected !== 1) return [false, transitioned.state] as const
    const [, timedOut] = yield* appendLifecycle(transitioned.state, input.runId, {
      _tag: "TimedOut",
      waitId: input.waitId,
      deadline: input.deadline,
    })
    const [, resumed] = yield* appendLifecycle(timedOut, input.runId, resumedEvent(input.waitId, resolution), "running")
    return [true, resumed] as const
  }),
)
