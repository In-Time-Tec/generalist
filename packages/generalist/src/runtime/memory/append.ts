import { DateTime, Effect, Function, Option, Types } from "effect"
import type { Prompt } from "effect/unstable/ai"
import type { Address } from "../address.js"
import type { BudgetLimits } from "../../core/durable/run-budget.js"
import { RuntimeUnavailable } from "../errors.js"
import { isTerminal, type RunStatus } from "../run.js"
import type { DurableAgentLoopEvent } from "../execution/agent/event.js"
import type { ExecutionResult } from "../execution/state.js"
import { eventIdFor, type LifecycleEvent, type RunEvent, type RunEventBase, type RunFailure } from "../run/event.js"
import type { MemoryPublication, MemoryState, StoredRun, SubscriberQueue } from "./state.js"
import { projectTreeEvent } from "../tree/event.js"
import { appendTerminalToolResults } from "./session-store.js"

const occurredAt = DateTime.now.pipe(Effect.map(DateTime.formatIso))
type MutableStoredRun = { -readonly [Key in keyof StoredRun]: StoredRun[Key] }
type EventBaseBuilder = Omit<RunEventBase, "parentRunId" | "causationId" | "attemptId"> & {
  parentRunId?: string
  causationId?: string
  attemptId?: string
}
type CancelledTerminal = { _tag: "RunCancelled"; reason?: string }
type CancellationRequestedInput = { _tag: "RunCancellationRequested"; reason?: string }
type CancelledInput = { _tag: "RunCancelled"; reason?: string }

const baseFields = (run: StoredRun, sequence: number, occurredAtValue: string): RunEventBase => {
  const base: EventBaseBuilder = {
    specVersion: "1",
    eventId: eventIdFor(run.runId, sequence),
    runId: run.runId,
    sequence,
    executableRef: run.executableRef,
    rootRunId: run.rootRunId,
    depth: run.depth,
    occurredAt: occurredAtValue,
    correlationId: run.message.correlationId,
  }
  if (run.parentRunId !== undefined) base.parentRunId = run.parentRunId
  if (run.message.causationId !== undefined) base.causationId = run.message.causationId
  if (run.attempt > 0) base.attemptId = `${run.runId}:attempt:${run.attempt}`
  return base
}

const terminalReason = (event: RunEvent): "completed" | "failed" | "cancelled" | undefined => {
  if (event._tag === "RunCompleted") return "completed"
  if (event._tag === "RunFailed") return "failed"
  if (event._tag === "RunCancelled") return "cancelled"
  return undefined
}

const terminalToolState = (state: MemoryState, runId: string, event: RunEvent) => {
  if (event._tag === "RunCancelled") {
    const terminal: CancelledTerminal = { _tag: "RunCancelled" }
    if (event.reason !== undefined) terminal.reason = event.reason
    return appendTerminalToolResults({ state, runId, terminal })
  }
  if (event._tag === "RunFailed") {
    return appendTerminalToolResults({ state, runId, terminal: { _tag: "RunFailed", error: event.error } })
  }
  if (event._tag === "RunCompleted") {
    return appendTerminalToolResults({ state, runId, terminal: { _tag: "RunCompleted" } })
  }
  return Effect.succeed(state)
}

const updateOptionalRunFields = (updated: MutableStoredRun, run: StoredRun, event: RunEvent): void => {
  if (run.parentRunId !== undefined) updated.parentRunId = run.parentRunId
  if (run.invocationId !== undefined) updated.invocationId = run.invocationId
  if (event._tag === "RunCancellationRequested") {
    if (event.reason !== undefined) updated.cancelReason = event.reason
    else if (run.cancelReason !== undefined) updated.cancelReason = run.cancelReason
  } else if (run.cancelReason !== undefined) updated.cancelReason = run.cancelReason
  if (event._tag === "RunCancelled" || event._tag === "RunCompleted" || event._tag === "RunFailed") {
    updated.terminalEventId = event.eventId
  } else if (run.terminalEventId !== undefined) updated.terminalEventId = run.terminalEventId
}

const discardPendingSteering = (
  run: StoredRun,
  pendingSteering: StoredRun["steering"],
  reason: "completed" | "failed" | "cancelled",
): StoredRun["steering"] =>
  run.steering.map((entry) =>
    pendingSteering.some((pending) => pending.entryId === entry.entryId)
      ? { ...entry, discardedReason: reason }
      : entry,
  )

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
  (args) => "runs" in Object(args[0]),
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
      const discardReason = terminalReason(event)
      const pendingSteering = run.steering.filter(
        (entry) => entry.consumedOperationId === undefined && entry.discardedReason === undefined,
      )
      if (discardReason !== undefined && pendingSteering.length > 0) {
        const runs = new Map(state.runs)
        runs.set(run.runId, {
          ...run,
          steering: discardPendingSteering(run, pendingSteering, discardReason),
        })
        const [, discarded] = yield* appendEvent({ ...state, runs }, runId, (base) => ({
          ...base,
          _tag: "SteeringDiscarded",
          entryIds: pendingSteering.map((entry) => entry.entryId),
          reason: discardReason,
        }))
        return yield* appendEvent(discarded, runId, build, nextStatus)
      }
      const terminalState = yield* terminalToolState(state, runId, event)
      const root = terminalState.treeRoots.get(run.rootRunId)
      if (root === undefined) {
        return yield* RuntimeUnavailable.make({ message: `tree root ${run.rootRunId} missing during append` })
      }
      const position = root.lastPosition + 1
      const updated: MutableStoredRun = {
        ...run,
        runId: run.runId,
        status: nextStatus ?? run.status,
        executableRef: run.executableRef,
        executableManifest: run.executableManifest,
        address: run.address,
        message: run.message,
        rootRunId: run.rootRunId,
        lastSequence: sequence,
        attempt: event._tag === "RunAttemptStarted" ? event.attempt : run.attempt,
        cancellationRequested: event._tag === "RunCancellationRequested" ? true : run.cancellationRequested,
        children: run.children,
        events: [...run.events, event],
        subscribers: run.subscribers,
      }
      updateOptionalRunFields(updated, run, event)
      const runs = new Map(terminalState.runs)
      if (event._tag === "RunCancelled" || event._tag === "RunCompleted" || event._tag === "RunFailed") {
        const { continuation: _, pendingOutcome: __, suspension: ___, ...withoutTerminalState } = updated
        runs.set(runId, withoutTerminalState)
      } else {
        runs.set(runId, updated)
      }
      const treeRoots = new Map(terminalState.treeRoots)
      treeRoots.set(run.rootRunId, {
        ...root,
        lastPosition: position,
        events: [...root.events, projectTreeEvent(event, position, run)],
      })
      const publication: Types.Mutable<MemoryPublication> = {
        runId,
        event,
        lastDeliveredSequence: run.lastSequence,
        subscribers: run.subscribers,
        treeSubscribers: root.subscribers,
      }
      const hostSessions = new Map(terminalState.hostSessions)
      const rootRun = terminalState.runs.get(run.rootRunId)
      const hostSession = rootRun === undefined ? undefined : hostSessions.get(rootRun.message.sessionId)
      if (hostSession !== undefined) {
        const cursor = hostSession.lastCursor + 1
        const entry = { cursor, event }
        hostSessions.set(hostSession.session.id, {
          ...hostSession,
          lastCursor: cursor,
          events: [...hostSession.events, entry],
        })
        publication.hostSession = {
          sessionId: hostSession.session.id,
          entry,
          lastDeliveredCursor: hostSession.lastCursor,
          subscribers: hostSession.subscribers,
        }
      }
      return [
        event,
        {
          ...terminalState,
          runs,
          treeRoots,
          hostSessions,
          publications: [...terminalState.publications, publication],
        },
      ] as const
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
  (args) => "runs" in Object(args[0]),
  (state: MemoryState, runId: string, event: LifecycleInput, nextStatus?: RunStatus) =>
    appendEvent(state, runId, (base) => ({ ...base, ...event }), nextStatus),
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

export const acceptedEvent = (input: {
  readonly address: Address
  readonly messageId: string
  readonly budget?: BudgetLimits | undefined
}) => {
  const event = {
    _tag: "RunAccepted" as const,
    messageId: input.messageId,
    address: input.address,
  }
  return input.budget === undefined ? event : { ...event, budget: input.budget }
}

export const attemptStartedEvent = (attempt: number) =>
  ({
    _tag: "RunAttemptStarted" as const,
    attempt,
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunAttemptStarted" }>, keyof RunEventBase>

export const waitingEvent = (wait: import("../run/wait.js").RunWait) =>
  ({
    _tag: "RunWaiting" as const,
    wait,
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunWaiting" }>, keyof RunEventBase>

export const resumedEvent: {
  (
    resolution: import("../run/wait.js").WaitResolution,
  ): (waitId: string) => Omit<Extract<LifecycleEvent, { _tag: "RunResumed" }>, keyof RunEventBase>
  (
    waitId: string,
    resolution: import("../run/wait.js").WaitResolution,
  ): Omit<Extract<LifecycleEvent, { _tag: "RunResumed" }>, keyof RunEventBase>
} = Function.dual(
  2,
  (waitId: string, resolution: import("../run/wait.js").WaitResolution) =>
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

type ChildLinked = Omit<Extract<LifecycleEvent, { _tag: "ChildLinked" }>, keyof RunEventBase>
type ChildLinkedDetails = Pick<ChildLinked, "readiness" | "key" | "label" | "origin" | "budget">

export const childLinkedEvent: {
  (
    invocationId: string,
    selection: string,
    prompt: Prompt.Prompt,
    childDepth: number,
    details: ChildLinkedDetails,
  ): (childRunId: string) => ChildLinked
  (
    childRunId: string,
    invocationId: string,
    selection: string,
    prompt: Prompt.Prompt,
    childDepth: number,
    details: ChildLinkedDetails,
  ): ChildLinked
} = Function.dual(
  (args) => args.length === 6 || "length" in Object(args[2]),
  (
    childRunId: string,
    invocationId: string,
    selection: string,
    prompt: Prompt.Prompt,
    childDepth: number,
    details: ChildLinkedDetails,
  ): ChildLinked => ({
    _tag: "ChildLinked",
    childRunId,
    invocationId,
    selection,
    prompt,
    childDepth,
    ...details,
  }),
)

export const childReadinessChangedEvent: {
  (
    readiness: import("../child/readiness.js").ChildReadiness,
  ): (childRunId: string) => Omit<Extract<LifecycleEvent, { _tag: "ChildReadinessChanged" }>, keyof RunEventBase>
  (
    childRunId: string,
    readiness: import("../child/readiness.js").ChildReadiness,
  ): Omit<Extract<LifecycleEvent, { _tag: "ChildReadinessChanged" }>, keyof RunEventBase>
} = Function.dual(
  2,
  (childRunId: string, readiness: import("../child/readiness.js").ChildReadiness) =>
    ({
      _tag: "ChildReadinessChanged" as const,
      childRunId,
      readiness,
    }) satisfies Omit<Extract<LifecycleEvent, { _tag: "ChildReadinessChanged" }>, keyof RunEventBase>,
)

export const childSettledEvent = (input: {
  readonly childRunId: string
  readonly terminalEventId: string
  readonly spend?: import("../../core/durable/run-budget.js").Spend
}) => {
  const event = {
    _tag: "ChildSettled" as const,
    childRunId: input.childRunId,
    terminalEventId: input.terminalEventId,
  }
  return input.spend === undefined ? event : { ...event, spend: input.spend }
}

export const makeFanOutAdmitted = (input: {
  readonly fanOutId: string
  readonly memberCount: number
  readonly concurrency: number
  readonly join: import("../child/fan-out.js").FanOutJoin
  readonly remainder: import("../child/fan-out.js").FanOutRemainder
}) =>
  ({
    _tag: "FanOutAdmitted" as const,
    ...input,
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "FanOutAdmitted" }>, keyof RunEventBase>

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

export const completedEvent = (
  result: ExecutionResult,
): Omit<Extract<LifecycleEvent, { _tag: "RunCompleted" }>, keyof RunEventBase> =>
  ({
    _tag: "RunCompleted" as const,
    result,
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunCompleted" }>, keyof RunEventBase>

export const failedEvent = (
  error: RunFailure,
): Omit<Extract<LifecycleEvent, { _tag: "RunFailed" }>, keyof RunEventBase> =>
  ({
    _tag: "RunFailed" as const,
    error,
  }) satisfies Omit<Extract<LifecycleEvent, { _tag: "RunFailed" }>, keyof RunEventBase>

export const cancellationRequestedEvent = (reason?: string) => {
  const event: CancellationRequestedInput = { _tag: "RunCancellationRequested" }
  if (reason !== undefined) event.reason = reason
  return event
}

export const cancelledEvent = (reason?: string) => {
  const event: CancelledInput = { _tag: "RunCancelled" }
  if (reason !== undefined) event.reason = reason
  return event
}

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
