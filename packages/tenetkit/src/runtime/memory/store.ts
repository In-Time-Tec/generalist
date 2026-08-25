import { Context, Effect, Layer, Option, Queue, Ref, SynchronizedRef } from "effect"
import {
  AddressNotFound,
  CursorExpired,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  SubscriberLagged,
  TreeCursorExpired,
  TreeCursorInvalid,
} from "../errors.js"
import { RunStore, type CompletionOutcome } from "../run-store.js"
import type { LayerOptions } from "../runtime.js"
import { emptyState, idempotencyKey, type MemoryPublication, type MemoryState } from "./state.js"
import { admitSend, admitSpawn, admitStart } from "./store-admit.js"
import { activateRoot } from "./store-activate.js"
import { admitProgramChild } from "./store-admit-program-child.js"
import { cancel, complete, emitAgentEvent, fail, respond, resume, signal, suspend } from "./store-control.js"
import { respondApproval } from "./store-approval.js"
import { isTerminal } from "../run.js"
import { followEvents, followTreeChanges, inspectRun, shutdownStore, toInspection } from "./store-events.js"
import {
  expireRunningOperation,
  getOperation,
  getOperationByKey,
  recordOperation,
  startOperation,
  completeOperation,
  commitModelResponse,
  commitInterruptedModelResponse,
} from "./store-operations.js"
import { resolveOperation } from "./store-operation-resolution.js"
import { recoverRunningOperations } from "./store-operation-recovery.js"
import { cancelSession } from "./store-session.js"
import {
  claimExecution,
  loadExecution,
  releaseExecution,
  requireExecutionClaim,
  retryExecution,
  saveExecution,
} from "./store-execution.js"
import { admitSteering, readSteering } from "./store-steering.js"
import {
  admitMessage,
  deliverPendingMessages,
  directory,
  listRelated,
  pendingMessages,
  settlementNotifications,
  registerAgentName,
  resolveAddress,
} from "./store-directory.js"
import { Prompt } from "effect/unstable/ai"
import { makeMemorySessionStore } from "./session-store.js"
import { admitFanOut } from "./store-fan-out.js"
import { inspectFanOut } from "./store-fan-out-inspection.js"
import { makeCursor } from "../tree-cursor.js"
import { projectRunSnapshot, projectTreeInspection, type InspectionRun } from "../inspection.js"
import { decodePinned, equals } from "../executable-manifest.js"
import {
  admitProgramAgents,
  completeProgram,
  commitProgramLog,
  reserveProgramOperation,
  resolveProgramOperation,
  suspendProgramOperation,
  settleProgramOperation,
  startProgramOperation,
} from "./store-program.js"
import type { RunActivation } from "../run-activation.js"
import { externalChildOperations } from "./store-external-child.js"
import { ExternalChildStore } from "../external-child-store.js"
const activationOf = (run: import("./state.js").StoredRun): RunActivation => {
  const intent: RunActivation["intent"] =
    run.status === "cancelling"
      ? "cancel"
      : run.ownerId === undefined &&
          (run.status === "running" ||
            (run.status === "queued" && run.parentRunId !== undefined && run.childReadiness === "ready"))
        ? "execute"
        : "inactive"
  return intent === "inactive"
    ? { runId: run.runId, intent }
    : { runId: run.runId, intent, attemptFence: run.attemptFence, runStatus: run.status }
}
const makeStoreServices = (options: LayerOptions) =>
  Effect.gen(function* () {
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    const stateRef = yield* SynchronizedRef.make(
      emptyState({
        addressBindings,
        subscriberQueueCapacity: options.subscriberQueueCapacity ?? 64,
      }),
    )
    yield* Effect.addFinalizer(() => shutdownStore(stateRef))
    const publish = (initial: MemoryState, publications: ReadonlyArray<MemoryPublication>) =>
      Effect.gen(function* () {
        let state = initial
        for (const publication of publications) {
          yield* Effect.forEach(publication.treeSubscribers.values(), (queue) => Queue.offer(queue, undefined), {
            discard: true,
          })
          for (const [subscriberId, queue] of publication.subscribers) {
            const run = state.runs.get(publication.runId)
            if (run?.subscribers.get(subscriberId) !== queue) continue
            const offered = yield* Queue.offer(queue, publication.event)
            if (offered) continue
            yield* Queue.fail(
              queue,
              SubscriberLagged.make({
                runId: publication.runId,
                lastDeliveredSequence: publication.lastDeliveredSequence,
              }),
            )
            const subscribers = new Map(run.subscribers)
            subscribers.delete(subscriberId)
            const runs = new Map(state.runs)
            runs.set(run.runId, { ...run, subscribers })
            state = { ...state, runs }
          }
        }
        return state
      })

    const modifyState = <A, E>(
      transition: (state: MemoryState) => Effect.Effect<readonly [A, MemoryState], E>,
    ): Effect.Effect<A, E | RuntimeUnavailable> =>
      stateRef.semaphore.withPermit(
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef.backing)
          const [result, next] = yield* transition(state)
          if (options.activationProjection !== undefined) {
            const touched = new Set<string>()
            for (const [runId, run] of next.runs) if (state.runs.get(runId) !== run) touched.add(runId)
            for (const runId of state.runs.keys()) if (!next.runs.has(runId)) touched.add(runId)
            const changes = [...touched].sort().map((runId): RunActivation => {
              const run = next.runs.get(runId)
              return run === undefined ? { runId, intent: "inactive" } : activationOf(run)
            })
            if (changes.length > 0) yield* options.activationProjection.applyInTransaction(changes)
          }
          const publications = next.publications
          const committed: MemoryState = { ...next, publications: [] }
          yield* Ref.set(stateRef.backing, committed)
          const published = yield* publish(committed, publications)
          if (published !== committed) yield* Ref.set(stateRef.backing, published)
          return result
        }).pipe(Effect.uninterruptible),
      )
    const update = <E>(transition: (state: MemoryState) => Effect.Effect<MemoryState, E>) =>
      modifyState((state) => transition(state).pipe(Effect.map((next) => [undefined, next] as const))).pipe(
        Effect.asVoid,
      )
    const fencedUpdate = <E>(
      input: import("../run-store.js").ExecutionClaim,
      transition: (state: MemoryState) => Effect.Effect<MemoryState, E>,
    ) => update((state) => requireExecutionClaim(state, input).pipe(Effect.andThen(transition(state))))
    const fencedModify = <A, E>(
      input: import("../run-store.js").ExecutionClaim,
      transition: (state: MemoryState) => Effect.Effect<readonly [A, MemoryState], E>,
    ) => modifyState((state) => requireExecutionClaim(state, input).pipe(Effect.andThen(transition(state))))
    const runStore = RunStore.of({
      info: Effect.succeed({ durability: "ephemeral", backend: "memory", multiWorker: false }),
      sessionStore: (sessionId) => Effect.succeed(Option.some(makeMemorySessionStore({ stateRef, sessionId }))),
      hasAdmission: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            state.closed
              ? RuntimeUnavailable.make({ message: "runtime store released" })
              : Effect.succeed(
                  state.idempotency.has(idempotencyKey(input.address, input.sessionId, input.idempotencyKey)),
                ),
          ),
        ),
      admitSend: (input) =>
        Effect.gen(function* () {
          const bound = addressBindings.get(input.message.to)
          if (bound === undefined) return yield* AddressNotFound.make({ address: input.message.to })
          const admitted = yield* Effect.try({
            try: () => decodePinned({ ref: input.executableRef, manifest: input.executableManifest }),
            catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
          })
          const binding = yield* Effect.try({
            try: () => decodePinned(bound),
            catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
          })
          if (!equals(binding, admitted)) {
            return yield* AddressNotFound.make({ address: input.message.to })
          }
          return yield* modifyState((state) => admitSend(state, input))
        }),
      admitStart: (input, startOptions) => modifyState((state) => admitStart(state, input, startOptions)),
      activate: (input) => modifyState((state) => activateRoot(state, input.runId)),
      admitSpawn: (input) => modifyState((state) => admitSpawn(state, input)),
      admitProgramChild: (input) => fencedModify(input, (state) => admitProgramChild(state, input)),
      admitProgramChildAndSuspend: (input) =>
        fencedModify(input, (state) =>
          Effect.gen(function* () {
            const [receipt, admitted] = yield* admitProgramChild(state, input)
            return [receipt, yield* suspend(admitted, input)] as const
          }),
        ),
      events: (input) => followEvents(stateRef, input),
      respond: (input) => update((state) => respond(state, input)),
      respondApproval: (input) => update((state) => respondApproval(state, input)),
      signal: (input) => update((state) => signal(state, input)),
      cancel: (input) => update((state) => cancel(state, input)),
      cancelSession: (input) => modifyState((state) => cancelSession(state, input)),
      admitSteering: (input) => modifyState((state) => admitSteering(state, input)),
      readSteering: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            Effect.gen(function* () {
              yield* requireExecutionClaim(state, input)
              return yield* readSteering(state, input)
            }),
          ),
        ),
      directory: (runId) => SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => directory(state, runId))),
      resolveAddress: (address) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => resolveAddress(state, address))),
      registerAgentName: (input) => modifyState((state) => registerAgentName(state, input)),
      listRelated: (runId) => SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => listRelated(state, runId))),
      admitMessage: (input) => modifyState((state) => admitMessage(state, input)),
      pendingMessages: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            state.closed
              ? RuntimeUnavailable.make({ message: "runtime store released" })
              : Effect.succeed(pendingMessages(state, input)),
          ),
        ),
      settlementNotifications: (input) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => settlementNotifications(state, input))),
      deliverPendingMessages: (input) => modifyState((state) => deliverPendingMessages(state, input)),
      inspect: (runId) => SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => inspectRun(state, runId))),
      snapshot: (runId) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            Effect.gen(function* () {
              const run = state.runs.get(runId)
              if (run === undefined) return yield* RunNotFound.make({ runId })
              return yield* projectRunSnapshot({
                inspection: toInspection(run),
                rootRunId: run.rootRunId,
                ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
                ...(run.invocationId === undefined ? {} : { invocationId: run.invocationId }),
                ...(run.terminalEventId === undefined ? {} : { terminalEventId: run.terminalEventId }),
                events: run.events,
                firstTreePosition: 0,
              })
            }),
          ),
        ),
      sessionRoots: (sessionId) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.map((state) =>
            [...state.runs.values()]
              .filter((run) => run.rootRunId === run.runId && run.message.sessionId === sessionId)
              .map((run) => run.runId),
          ),
        ),
      inspectTree: (rootRunId) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            Effect.gen(function* () {
              const root = state.treeRoots.get(rootRunId)
              if (root === undefined) return yield* RunNotFound.make({ runId: rootRunId })
              const first = new Map<string, number>()
              for (const [position, event] of root.events.entries())
                if (!first.has(event.runId)) first.set(event.runId, position)
              const runs: Array<InspectionRun> = []
              for (const run of state.runs.values()) {
                if (run.rootRunId !== rootRunId) continue
                runs.push({
                  inspection: toInspection(run),
                  rootRunId,
                  ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
                  ...(run.invocationId === undefined ? {} : { invocationId: run.invocationId }),
                  ...(run.terminalEventId === undefined ? {} : { terminalEventId: run.terminalEventId }),
                  events: run.events,
                  firstTreePosition: first.get(run.runId) ?? -1,
                })
              }
              return yield* projectTreeInspection(rootRunId, makeCursor(rootRunId, root.lastPosition), runs)
            }),
          ),
        ),
      history: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            inspectRun(state, input.runId).pipe(
              Effect.flatMap((inspection) =>
                input.cursor < -1 || input.cursor > inspection.lastSequence
                  ? CursorExpired.make({ runId: input.runId, cursor: input.cursor, earliestSequence: 0 })
                  : Effect.succeed(
                      state.runs
                        .get(input.runId)!
                        .events.filter((event) => event.sequence > input.cursor)
                        .slice(0, input.limit),
                    ),
              ),
            ),
          ),
        ),
      treeHistory: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            Effect.gen(function* () {
              const root = state.treeRoots.get(input.rootRunId)
              if (root === undefined) return yield* RunNotFound.make({ runId: input.rootRunId })
              if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000) {
                return yield* TreeCursorInvalid.make({
                  rootRunId: input.rootRunId,
                  cursor: makeCursor(input.rootRunId, input.position),
                  message: "tree history limit must be an integer between 1 and 1000",
                })
              }
              if (input.position > root.lastPosition) {
                return yield* TreeCursorInvalid.make({
                  rootRunId: input.rootRunId,
                  cursor: makeCursor(input.rootRunId, input.position),
                  message: "tree cursor position is in the future",
                })
              }
              if (input.position < root.earliestPosition - 1) {
                return yield* TreeCursorExpired.make({
                  rootRunId: input.rootRunId,
                  cursor: makeCursor(input.rootRunId, input.position),
                  earliestCursor: makeCursor(input.rootRunId, root.earliestPosition - 1),
                })
              }
              const events = root.events.slice(input.position + 1, input.position + 1 + input.limit)
              const position = events.length === 0 ? input.position : input.position + events.length
              return {
                events,
                cursor: makeCursor(input.rootRunId, position),
                hasMore: position < root.lastPosition,
              }
            }),
          ),
        ),
      treeChanges: (rootRunId) => followTreeChanges(stateRef, rootRunId),
      list: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.map((state) => {
            const runs = [...state.runs.values()]
            const start =
              input.afterRunId === undefined
                ? 0
                : (() => {
                    const index = runs.findIndex((run) => run.runId === input.afterRunId)
                    return index === -1 ? 0 : index + 1
                  })()
            const filtered = runs
              .slice(start)
              .filter((run) => input.status === undefined || run.status === input.status)
            const ordered = (input.order ?? "newest") === "oldest" ? filtered : filtered.toReversed()
            return ordered.slice(0, input.limit).map(toInspection)
          }),
        ),
      complete: (input) =>
        modifyState((state) =>
          requireExecutionClaim(state, input).pipe(
            Effect.andThen(
              ((): Effect.Effect<
                readonly [CompletionOutcome, MemoryState],
                RunNotFound | RunTerminal | RuntimeUnavailable
              > =>
                Effect.gen(function* () {
                  const run = state.runs.get(input.runId)!
                  const pending = run.steering.filter(
                    (entry) => entry.consumedOperationId === undefined && entry.discardedReason === undefined,
                  )
                  if (!run.cancellationRequested && pending.length > 0 && "session" in input.result) {
                    const continuation = {
                      schemaVersion: 1 as const,
                      prompt: pending.reduce<Prompt.Prompt>(
                        (prompt, entry) => Prompt.concat(prompt, entry.prompt),
                        Prompt.empty,
                      ),
                      nextTurn: input.result.turns,
                      steeringEntryIds: pending.map((entry) => entry.entryId),
                    }
                    const runs = new Map(state.runs)
                    const { suspension: _, ...withoutSuspension } = run
                    runs.set(run.runId, { ...withoutSuspension, continuation })
                    const outcome: CompletionOutcome = { _tag: "SteeringPending", continuation }
                    return [outcome, { ...state, runs }] as const
                  }
                  const runs = new Map(state.runs)
                  const { continuation: _, ...withoutContinuation } = run
                  runs.set(run.runId, withoutContinuation)
                  const outcome: CompletionOutcome = { _tag: "Completed" }
                  return [outcome, yield* complete({ ...state, runs }, input)] as const
                }))(),
            ),
          ),
        ),
      fail: (input) => fencedUpdate(input, (state) => fail(state, input)),
      suspend: (input) => fencedUpdate(input, (state) => suspend(state, input)),
      resume: (input) => update((state) => resume(state, input)),
      emitAgentEvent: (input) => fencedUpdate(input, (state) => emitAgentEvent(state, input)),
      recordOperation: (input) => fencedModify(input, (state) => recordOperation(state, input)),
      startOperation: (input) => fencedModify(input, (state) => startOperation(state, input)),
      completeOperation: (input) => fencedModify(input, (state) => completeOperation(state, input)),
      commitModelResponse: (input) => fencedModify(input, (state) => commitModelResponse(state, input)),
      commitInterruptedModelResponse: (input) =>
        fencedModify(input, (state) => commitInterruptedModelResponse(state, input)),
      expireRunningOperation: (input) => fencedModify(input, (state) => expireRunningOperation(state, input)),
      recoverRunningOperations: (input) => fencedModify(input, (state) => recoverRunningOperations(state, input)),
      getOperation: (input) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => getOperation(state, input))),
      getOperationByKey: (input) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => getOperationByKey(state, input))),
      resolveOperation: (input) =>
        update((state) =>
          (state.programOperations.has(`${input.runId}\0${input.operationId}`)
            ? resolveProgramOperation(state, input)
            : resolveOperation(state, input)
          ).pipe(
            // A resolved unknown outcome must settle a cancellation that was admitted while it was pending.
            Effect.flatMap((resolved) => {
              const run = resolved.runs.get(input.runId)
              return run === undefined || !run.cancellationRequested || isTerminal(run.status)
                ? Effect.succeed(resolved)
                : cancel(resolved, {
                    runId: input.runId,
                    ...(run.cancelReason === undefined ? {} : { reason: run.cancelReason }),
                  })
            }),
          ),
        ),
      claimExecution: (input) => modifyState((state) => claimExecution(state, input)),
      loadExecution: (runId) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => loadExecution(state, runId))),
      releaseExecution: (input) => modifyState((state) => releaseExecution(state, input)),
      saveExecution: (input) => update((state) => saveExecution(state, input)),
      retryExecution: (input) => modifyState((state) => retryExecution(state, input)),
      admitFanOut: (input) => modifyState((state) => admitFanOut(state, input)),
      inspectFanOut: (fanOutId) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => inspectFanOut(state, fanOutId))),
      reserveProgramOperation: (input) => fencedModify(input, (state) => reserveProgramOperation(state, input)),
      suspendProgramOperation: (input) => fencedModify(input, (state) => suspendProgramOperation(state, input)),
      admitProgramAgents: (input) => fencedModify(input, (state) => admitProgramAgents(state, input)),
      settleProgramOperation: (input) => fencedModify(input, (state) => settleProgramOperation(state, input)),
      startProgramOperation: (input) => fencedModify(input, (state) => startProgramOperation(state, input)),
      loadProgramState: (runId) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            state.runs.has(runId)
              ? Effect.succeed(state.programStates.get(runId))
              : Effect.fail(RunNotFound.make({ runId })),
          ),
        ),
      getProgramOperation: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            state.runs.has(input.runId)
              ? Effect.succeed(state.programOperations.get(`${input.runId}\0${input.operation}`))
              : Effect.fail(RunNotFound.make({ runId: input.runId })),
          ),
        ),
      completeProgram: (input) => fencedModify(input, (state) => completeProgram(state, input)),
      commitProgramLog: (input) => fencedModify(input, (state) => commitProgramLog(state, input)),
    })
    const externalChildStore = ExternalChildStore.of({
      reserve: (input) => modifyState((state) => externalChildOperations.reserve(state, input)),
      acknowledge: (placementId) => modifyState((state) => externalChildOperations.acknowledge(state, placementId)),
      settle: (input) => modifyState((state) => externalChildOperations.settle(state, input)),
      cancel: (placementId) => modifyState((state) => externalChildOperations.cancel(state, placementId)),
      admitRoot: (input) => modifyState((state) => externalChildOperations.admitRoot(state, input)),
      activateRoot: (placementId) => modifyState((state) => externalChildOperations.activateRoot(state, placementId)),
      inspectRoot: (placementId) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) => externalChildOperations.inspectRoot(state, placementId)),
        ),
      cancelRoot: (placementId, reason) =>
        modifyState((state) => externalChildOperations.cancelRoot(state, placementId, reason)),
      rootSettlement: (placementId) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) => externalChildOperations.rootSettlement(state, placementId)),
        ),
      acknowledgeRootSettlement: (input) =>
        modifyState((state) => externalChildOperations.acknowledgeRootSettlement(state, input)),
    })
    return { runStore, externalChildStore }
  })
export const makeRunStore = (options: LayerOptions) =>
  makeStoreServices(options).pipe(Effect.map(({ runStore }) => runStore))
export const layerMemory = (options: LayerOptions): Layer.Layer<RunStore | ExternalChildStore> =>
  Layer.effectContext(
    makeStoreServices(options).pipe(
      Effect.map(({ runStore, externalChildStore }) =>
        Context.make(RunStore, runStore).pipe(Context.add(ExternalChildStore, externalChildStore)),
      ),
    ),
  )
