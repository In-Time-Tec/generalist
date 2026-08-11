import { DateTime, Effect, Function, Option, Queue } from "effect"
import type { Prompt } from "effect/unstable/ai"
import type { Address } from "../address.js"
import { RuntimeUnavailable, SubscriberLagged } from "../errors.js"
import { isTerminal, type RunStatus } from "../run.js"
import type { DurableAgentLoopEvent } from "../agent-event.js"
import type { ExecutionResult } from "../execution-state.js"
import { eventIdFor, type LifecycleEvent, type RunEvent, type RunEventBase, type RunFailure } from "../run-event.js"
import type { MemoryState, StoredRun, SubscriberQueue } from "./state.js"
import { projectTreeEvent } from "../tree-event.js"

const occurredAt = DateTime.now.pipe(Effect.map(DateTime.formatIso))

const baseFields = (run: StoredRun, sequence: number, occurredAtValue: string): RunEventBase => ({
  specVersion: "1",
  eventId: eventIdFor(run.runId, sequence),
  runId: run.runId,
  sequence,
  executableRef: run.executableRef,
  rootRunId: run.rootRunId,
  occurredAt: occurredAtValue,
  ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
  ...(run.message.causationId === undefined ? {} : { causationId: run.message.causationId }),
  ...(run.message.correlationId === undefined ? {} : { correlationId: run.message.correlationId }),
  ...(run.attempt > 0 ? { attemptId: `${run.runId}:attempt:${run.attempt}` } : {}),
})

export const appendEvent: {
  (
    runId: string,
    build: (base: RunEventBase, run: StoredRun) => RunEvent,
    nextStatus?: RunStatus,
  ): (state: MemoryState) => Effect.Effect<readonly [RunEvent, MemoryState], RuntimeUnavailable>
  (
    state: MemoryState,
    runId: string,
    build: (base: RunEventBase, run: StoredRun) => RunEvent,
    nextStatus?: RunStatus,
  ): Effect.Effect<readonly [RunEvent, MemoryState], RuntimeUnavailable>
} = Function.dual(
  (args) => typeof args[0] === "object" && args[0] !== null,
  (
    state: MemoryState,
    runId: string,
    build: (base: RunEventBase, run: StoredRun) => RunEvent,
    nextStatus?: RunStatus,
  ) =>
    Effect.gen(function* () {
      if (state.closed) {
        return yield* RuntimeUnavailable.make({ message: "runtime store released" })
      }
      const run = state.runs.get(runId)
      if (run === undefined) {
        return yield* RuntimeUnavailable.make({ message: `run ${runId} missing during append` })
      }
      const sequence = run.lastSequence + 1
      const at = yield* occurredAt
      const event = build(baseFields(run, sequence, at), run)
      const root = state.treeRoots.get(run.rootRunId)
      if (root === undefined) {
        return yield* RuntimeUnavailable.make({ message: `tree root ${run.rootRunId} missing during append` })
      }
      const position = root.lastPosition + 1
      yield* Effect.forEach(root.subscribers.values(), (queue) => Queue.offer(queue, undefined), { discard: true })
      const subscribers = new Map(run.subscribers)
      for (const [subscriberId, queue] of run.subscribers) {
        const offered = yield* Queue.offer(queue, event)
        if (!offered) {
          yield* Queue.fail(queue, SubscriberLagged.make({ runId, lastDeliveredSequence: run.lastSequence }))
          subscribers.delete(subscriberId)
        }
      }
      const updated: StoredRun = {
        ...run,
        runId: run.runId,
        status: nextStatus ?? run.status,
        executableRef: run.executableRef,
        executableManifest: run.executableManifest,
        address: run.address,
        message: run.message,
        rootRunId: run.rootRunId,
        respondedWaitIds: run.respondedWaitIds,
        lastSequence: sequence,
        attempt: event._tag === "RunAttemptStarted" ? event.attempt : run.attempt,
        cancellationRequested: event._tag === "RunCancellationRequested" ? true : run.cancellationRequested,
        children: run.children,
        events: [...run.events, event],
        subscribers,
        ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
        ...(run.invocationId === undefined ? {} : { invocationId: run.invocationId }),
        ...(event._tag === "RunWaiting"
          ? { activeWaitId: event.wait.waitId, wait: event.wait }
          : event._tag === "RunResumed"
            ? run.wait === undefined
              ? {}
              : { wait: run.wait }
            : run.activeWaitId === undefined
              ? {}
              : { activeWaitId: run.activeWaitId }),
        ...(event._tag === "RunCancellationRequested"
          ? event.reason === undefined
            ? run.cancelReason === undefined
              ? {}
              : { cancelReason: run.cancelReason }
            : { cancelReason: event.reason }
          : run.cancelReason === undefined
            ? {}
            : { cancelReason: run.cancelReason }),
        ...(event._tag === "RunCancelled" || event._tag === "RunCompleted" || event._tag === "RunFailed"
          ? { terminalEventId: event.eventId }
          : run.terminalEventId === undefined
            ? {}
            : { terminalEventId: run.terminalEventId }),
      }
      const runs = new Map(state.runs)
      if (event._tag === "RunCancelled" || event._tag === "RunCompleted" || event._tag === "RunFailed") {
        const { continuation: _, pendingOutcome: __, ...withoutTerminalState } = updated
        runs.set(runId, withoutTerminalState)
      } else {
        runs.set(runId, updated)
      }
      const treeRoots = new Map(state.treeRoots)
      treeRoots.set(run.rootRunId, {
        ...root,
        lastPosition: position,
        events: [...root.events, projectTreeEvent(event, position, run)],
      })
      return [event, { ...state, runs, treeRoots }] as const
    }),
)

type LifecycleInput = LifecycleEvent extends infer Event
  ? Event extends LifecycleEvent
    ? Omit<Event, keyof RunEventBase>
    : never
  : never

export const appendLifecycle: {
  (
    runId: string,
    event: LifecycleInput,
    nextStatus?: RunStatus,
  ): (state: MemoryState) => Effect.Effect<readonly [RunEvent, MemoryState], RuntimeUnavailable>
  (
    state: MemoryState,
    runId: string,
    event: LifecycleInput,
    nextStatus?: RunStatus,
  ): Effect.Effect<readonly [RunEvent, MemoryState], RuntimeUnavailable>
} = Function.dual(
  (args) => typeof args[0] === "object" && args[0] !== null,
  (state: MemoryState, runId: string, event: LifecycleInput, nextStatus?: RunStatus) =>
    appendEvent(state, runId, (base) => ({ ...base, ...event }) as RunEvent, nextStatus),
)

export const appendAgentEvent: {
  (
    runId: string,
    event: DurableAgentLoopEvent,
  ): (state: MemoryState) => Effect.Effect<readonly [RunEvent, MemoryState], RuntimeUnavailable>
  (
    state: MemoryState,
    runId: string,
    event: DurableAgentLoopEvent,
  ): Effect.Effect<readonly [RunEvent, MemoryState], RuntimeUnavailable>
} = Function.dual(3, (state: MemoryState, runId: string, event: DurableAgentLoopEvent) =>
  appendEvent(state, runId, (base) => ({ ...base, ...event })),
)

export const makeAccepted: {
  (messageId: string): (address: Address) => Omit<Extract<LifecycleEvent, { _tag: "RunAccepted" }>, keyof RunEventBase>
  (address: Address, messageId: string): Omit<Extract<LifecycleEvent, { _tag: "RunAccepted" }>, keyof RunEventBase>
} = Function.dual(
  2,
  (address: Address, messageId: string) =>
    ({
      _tag: "RunAccepted" as const,
      messageId,
      address,
    }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunAccepted" }>, keyof RunEventBase>,
)

export const makeAttemptStarted = (attempt: number) =>
  ({
    _tag: "RunAttemptStarted" as const,
    attempt,
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunAttemptStarted" }>, keyof RunEventBase>

export const makeWaiting = (wait: import("../run-wait.js").RunWait) =>
  ({
    _tag: "RunWaiting" as const,
    wait,
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunWaiting" }>, keyof RunEventBase>

export const makeResumed: {
  (
    resolution: import("../run-wait.js").WaitResolution,
  ): (waitId: string) => Omit<Extract<LifecycleEvent, { _tag: "RunResumed" }>, keyof RunEventBase>
  (
    waitId: string,
    resolution: import("../run-wait.js").WaitResolution,
  ): Omit<Extract<LifecycleEvent, { _tag: "RunResumed" }>, keyof RunEventBase>
} = Function.dual(
  2,
  (waitId: string, resolution: import("../run-wait.js").WaitResolution) =>
    ({
      _tag: "RunResumed" as const,
      waitId,
      resolution,
    }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunResumed" }>, keyof RunEventBase>,
)

export const makeUnknown = (operationId: string) =>
  ({
    _tag: "OperationUnknown" as const,
    operationId,
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "OperationUnknown" }>, keyof RunEventBase>

export const makeChildLinked: {
  (
    invocationId: string,
    selection: string,
    prompt: Prompt.Prompt,
  ): (childRunId: string) => Omit<Extract<LifecycleEvent, { _tag: "ChildLinked" }>, keyof RunEventBase>
  (
    childRunId: string,
    invocationId: string,
    selection: string,
    prompt: Prompt.Prompt,
  ): Omit<Extract<LifecycleEvent, { _tag: "ChildLinked" }>, keyof RunEventBase>
} = Function.dual(
  4,
  (childRunId: string, invocationId: string, selection: string, prompt: Prompt.Prompt) =>
    ({
      _tag: "ChildLinked" as const,
      childRunId,
      invocationId,
      selection,
      prompt,
    }) satisfies Omit<Extract<LifecycleEvent, { _tag: "ChildLinked" }>, keyof RunEventBase>,
)

export const makeChildSettled: {
  (
    terminalEventId: string,
  ): (childRunId: string) => Omit<Extract<LifecycleEvent, { _tag: "ChildSettled" }>, keyof RunEventBase>
  (
    childRunId: string,
    terminalEventId: string,
  ): Omit<Extract<LifecycleEvent, { _tag: "ChildSettled" }>, keyof RunEventBase>
} = Function.dual(
  2,
  (childRunId: string, terminalEventId: string) =>
    ({
      _tag: "ChildSettled" as const,
      childRunId,
      terminalEventId,
    }) satisfies Omit<Extract<LifecycleEvent, { _tag: "ChildSettled" }>, keyof RunEventBase>,
)

export const makeFanOutAdmitted: {
  (
    memberCount: number,
    concurrency: number,
    join: import("../fan-out.js").FanOutJoin,
    remainder: import("../fan-out.js").FanOutRemainder,
  ): (fanOutId: string) => Omit<Extract<LifecycleEvent, { _tag: "FanOutAdmitted" }>, keyof RunEventBase>
  (
    fanOutId: string,
    memberCount: number,
    concurrency: number,
    join: import("../fan-out.js").FanOutJoin,
    remainder: import("../fan-out.js").FanOutRemainder,
  ): Omit<Extract<LifecycleEvent, { _tag: "FanOutAdmitted" }>, keyof RunEventBase>
} = Function.dual(
  5,
  (
    fanOutId: string,
    memberCount: number,
    concurrency: number,
    join: import("../fan-out.js").FanOutJoin,
    remainder: import("../fan-out.js").FanOutRemainder,
  ) =>
    ({
      _tag: "FanOutAdmitted" as const,
      fanOutId,
      memberCount,
      concurrency,
      join,
      remainder,
    }) satisfies Omit<Extract<LifecycleEvent, { _tag: "FanOutAdmitted" }>, keyof RunEventBase>,
)

export const makeFanOutJoined: {
  (
    status: "succeeded" | "failed" | "cancelled",
    counts: {
      readonly succeeded: number
      readonly failed: number
      readonly cancelled: number
      readonly abandoned: number
    },
    remainder: ReadonlyArray<{
      readonly childRunId: string
      readonly action: "cancellation-requested" | "abandoned"
    }>,
  ): (fanOutId: string) => Omit<Extract<LifecycleEvent, { _tag: "FanOutJoined" }>, keyof RunEventBase>
  (
    fanOutId: string,
    status: "succeeded" | "failed" | "cancelled",
    counts: {
      readonly succeeded: number
      readonly failed: number
      readonly cancelled: number
      readonly abandoned: number
    },
    remainder: ReadonlyArray<{
      readonly childRunId: string
      readonly action: "cancellation-requested" | "abandoned"
    }>,
  ): Omit<Extract<LifecycleEvent, { _tag: "FanOutJoined" }>, keyof RunEventBase>
} = Function.dual(
  4,
  (
    fanOutId: string,
    status: "succeeded" | "failed" | "cancelled",
    counts: {
      readonly succeeded: number
      readonly failed: number
      readonly cancelled: number
      readonly abandoned: number
    },
    remainder: ReadonlyArray<{
      readonly childRunId: string
      readonly action: "cancellation-requested" | "abandoned"
    }>,
  ) =>
    ({ _tag: "FanOutJoined" as const, fanOutId, status, ...counts, remainder }) satisfies Omit<
      Extract<LifecycleEvent, { _tag: "FanOutJoined" }>,
      keyof RunEventBase
    >,
)

export const makeCompleted = (
  result: ExecutionResult,
): Omit<Extract<LifecycleEvent, { _tag: "RunCompleted" }>, keyof RunEventBase> =>
  ({
    _tag: "RunCompleted" as const,
    result,
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunCompleted" }>, keyof RunEventBase>

export const makeFailed = (
  error: RunFailure,
): Omit<Extract<LifecycleEvent, { _tag: "RunFailed" }>, keyof RunEventBase> =>
  ({
    _tag: "RunFailed" as const,
    error,
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunFailed" }>, keyof RunEventBase>

export const makeCancellationRequested = (reason?: string) =>
  ({
    _tag: "RunCancellationRequested" as const,
    ...(reason === undefined ? {} : { reason }),
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunCancellationRequested" }>, keyof RunEventBase>

export const makeCancelled = (reason?: string) =>
  ({
    _tag: "RunCancelled" as const,
    ...(reason === undefined ? {} : { reason }),
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunCancelled" }>, keyof RunEventBase>

export const requireOpenRun: {
  (runId: string): (state: MemoryState) => Effect.Effect<StoredRun, RuntimeUnavailable>
  (state: MemoryState, runId: string): Effect.Effect<StoredRun, RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, runId: string): Effect.Effect<StoredRun, RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  if (run === undefined) return Effect.fail(RuntimeUnavailable.make({ message: `run ${runId} missing` }))
  return Effect.succeed(run)
})

export const rejectIfTerminal = (run: StoredRun): Option.Option<"succeeded" | "failed" | "cancelled"> =>
  isTerminal(run.status) ? Option.some(run.status) : Option.none()

export type { SubscriberQueue }
