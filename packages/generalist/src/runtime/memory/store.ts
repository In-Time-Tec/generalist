/* eslint-disable max-lines -- the memory store wires one storage service contract. */
import { Context, Effect, Layer, Option, Ref, SynchronizedRef } from "effect"
import {
  AddressNotFound,
  CursorExpired,
  IllegalOperatorAction,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  TreeCursorExpired,
  TreeCursorFuture,
  TreeReplayLimitInvalid,
} from "../errors.js"
import { RunStore, type CompletionOutcome } from "../run/store.js"
import type { LayerOptions } from "../service.js"
import { emptyState, idempotencyKey, type MemoryState } from "./state.js"
import { admitSend, admitSpawn, admitStart } from "./store/admit.js"
import { activateRoot, activationOf } from "./store/activate.js"
import { extendBudget } from "./store/control/budget.js"
import { admitProgramChild, admitProgramChildrenAndSuspend } from "./store/child/admit-program-child.js"
import { cancel, complete, emitAgentEvent, fail, respond, resume, signal, suspend } from "./store/control.js"
import { respondApproval } from "./store/approval.js"
import { isTerminal } from "../run.js"
import { followEvents, followTreeChanges, inspectRun, shutdownStore, toInspection } from "./store/events.js"
import {
  recordOperation,
  startOperation,
  completeOperation,
  commitModelResponse,
  commitInterruptedModelResponse,
} from "./store/operation/operations.js"
import { expireRunningOperation } from "./store/operation/expiry.js"
import { acknowledgeOperationCancellation, operationCancellations } from "./store/operation/cancellation.js"
import { getOperation, getOperationByKey } from "./store/operation/inspection.js"
import { resolveOperation } from "./store/operation/resolution.js"
import { recoverRunningOperations } from "./store/operation/recovery.js"
import { cancelSession } from "./store/session.js"
import {
  claimExecution,
  loadExecution,
  releaseExecution,
  requireExecutionClaim,
  revokeSession,
  retryExecution,
  saveExecution,
} from "./store/execution.js"
import { admitSteering, readSteering } from "./store/steering.js"
import {
  directory,
  listRelated,
  settlementNotifications,
  registerAgentName,
  resolveAddress,
} from "./store/directory.js"
import { Prompt } from "effect/unstable/ai"
import type { RunEvent } from "../run/event.js"
import { claimedStore as memorySessionStore, reader as memorySessionReader } from "./session-store.js"
import { admitFanOut } from "./store/fan-out/service.js"
import { inspectFanOut } from "./store/fan-out/inspection.js"
import { make as makeTreeCursor } from "../tree/cursor.js"
import { projectRunSnapshot, projectTreeCheckpoint, type InspectionRun } from "../execution/inspection.js"
import { decodePinned, equals } from "../executable/manifest-internal.js"
import {
  admitProgramAgents,
  completeProgram,
  commitProgramLog,
  reserveProgramOperation,
  resolveProgramOperation,
  suspendProgramOperation,
  settleProgramOperation,
  startProgramOperation,
} from "./store/program.js"
import { externalChildOperations } from "./store/child/external.js"
import { ExternalChildStore } from "../child/external/store.js"
import type { RunActivation } from "../run/activation.js"
import { acknowledge, loadAcknowledged } from "./store/acknowledgement.js"
import { make as makeHostSessionStore } from "./store/host-session.js"
import { publish } from "./store/event/publications.js"
import {
  appendAction as appendOperatorAction,
  journal as recoveryJournal,
  resolveUnknown as resolveUnknownOperation,
  retry as retryRecovery,
  wake as wakeRecovery,
} from "./store/operation/operator.js"
import { explain as explainRecovery } from "../execution/recovery/operator.js"
import { fork, rewind } from "./store/fork/index.js"
import { dueAwaitEvents, timeoutAwaitEvent, wake } from "./store/trigger/wake.js"
import { advanceSchedule, claimSchedules, registerSchedule } from "./store/trigger/schedule.js"

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
            const changes = [...touched].toSorted().map((runId): RunActivation => {
              const run = next.runs.get(runId)
              return run === undefined ? { runId, intent: "inactive" } : activationOf(run)
            })
            if (changes.length > 0) yield* options.activationProjection.applyInTransaction(changes)
          }
          const publications = next.publications
          const committed: MemoryState = { ...next, publications: [] }
          yield* Ref.set(stateRef.backing, committed)
          const published = yield* publish({ initial: committed, publications })
          if (published !== committed) yield* Ref.set(stateRef.backing, published)
          return result
        }).pipe(Effect.uninterruptible),
      )
    const update = <E>(transition: (state: MemoryState) => Effect.Effect<MemoryState, E>) =>
      modifyState((state) => transition(state).pipe(Effect.map((next) => [undefined, next] as const))).pipe(
        Effect.asVoid,
      )
    const fencedUpdate = <E>(
      input: import("../run/store.js").ExecutionClaim,
      transition: (state: MemoryState) => Effect.Effect<MemoryState, E>,
    ) => update((state) => requireExecutionClaim(state, input).pipe(Effect.andThen(transition(state))))
    const fencedModify = <A, E>(
      input: import("../run/store.js").ExecutionClaim,
      transition: (state: MemoryState) => Effect.Effect<readonly [A, MemoryState], E>,
    ) => modifyState((state) => requireExecutionClaim(state, input).pipe(Effect.andThen(transition(state))))
    const runStore = RunStore.of({
      info: Effect.succeed({ durability: "ephemeral", backend: "memory", multiWorker: false }),
      sessionReader: (sessionId) => Effect.succeed(Option.some(memorySessionReader({ stateRef, sessionId }))),
      claimedSessionStore: (claim) => Effect.succeed(Option.some(memorySessionStore({ stateRef, claim }))),
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
      extendBudget: (runId, delta) => modifyState((state) => extendBudget(state, runId, delta)),
      admitSpawn: (input) => modifyState((state) => admitSpawn(state, input)),
      admitProgramChild: (input) => fencedModify(input, (state) => admitProgramChild(state, input)),
      admitProgramChildAndSuspend: (input) =>
        fencedModify(input, (state) => admitProgramChildrenAndSuspend(state, input)),
      events: (input) => followEvents(stateRef, input),
      respond: (input) => update((state) => respond(state, input)),
      respondApproval: (input) =>
        update((state) =>
          respondApproval(state, input).pipe(
            Effect.flatMap((responded) =>
              input.operator === undefined
                ? Effect.succeed(responded)
                : appendOperatorAction(responded, input.runId, input.operator, {
                    _tag: "ResolveApproval",
                    token: input.approvalId,
                    decision: input.decision,
                  }),
            ),
          ),
        ),
      signal: (input) => update((state) => signal(state, input)),
      wake: (input) => modifyState((state) => wake(state, input)),
      dueAwaitEvents: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            state.closed
              ? RuntimeUnavailable.make({ message: "runtime store released" })
              : Effect.succeed(dueAwaitEvents(state, input)),
          ),
        ),
      timeoutAwaitEvent: (input) => modifyState((state) => timeoutAwaitEvent(state, input)),
      registerSchedule: (record) => modifyState((state) => registerSchedule(state, record)),
      claimSchedules: (input) => modifyState((state) => claimSchedules(state, input)),
      advanceSchedule: (input) => update((state) => advanceSchedule(state, input)),
      cancel: (input) => update((state) => cancel(state, input)),
      cancelSession: (input) => modifyState((state) => cancelSession(state, input)),
      admitSteering: (input) => modifyState((state) => admitSteering(state, input)),
      admitRollback: (input) =>
        modifyState((state) =>
          Effect.gen(function* () {
            const source = state.runs.get(input.runId)
            if (source === undefined) return yield* RunNotFound.make({ runId: input.runId })
            const prior = source.events.some(
              (event) => event._tag === "Inbox" && event.idempotencyKey === input.idempotencyKey,
            )
            if (prior) return yield* admitSteering(state, input)
            const [, rewound] = yield* rewind(state, {
              runId: input.runId,
              branchRunId: input.branchRunId,
              toSequence: Math.max(0, source.lastTurnCompletedSequence),
            })
            const [admission, admitted] = yield* admitSteering(rewound, input)
            const run = admitted.runs.get(input.runId)
            if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
            const previousTurn = run.events.findLast(
              (event): event is Extract<RunEvent, { readonly _tag: "TurnCompleted" }> => event._tag === "TurnCompleted",
            )
            const continuation = {
              schemaVersion: 1 as const,
              prompt: input.prompt,
              nextTurn: (previousTurn?.turn ?? -1) + 1,
              steeringEntryIds: [admission.receipt.entryId],
            }
            const prepared = {
              ...admitted,
              runs: new Map(admitted.runs).set(input.runId, { ...run, continuation }),
            }
            const [, activated] = yield* activateRoot(prepared, input.runId)
            return [admission, activated] as const
          }),
        ),
      readSteering: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            Effect.gen(function* () {
              yield* requireExecutionClaim(state, input)
              return yield* readSteering(state, input)
            }),
          ),
        ),
      pendingSteering: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) => readSteering(state, input)),
          Effect.map((entries) => entries.slice(0, input.limit)),
        ),
      directory: (runId) => SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => directory(state, runId))),
      resolveAddress: (address) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => resolveAddress(state, address))),
      registerAgentName: (input) => modifyState((state) => registerAgentName(state, input)),
      listRelated: (runId) => SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => listRelated(state, runId))),
      settlementNotifications: (input) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => settlementNotifications(state, input))),
      inspect: (runId) => SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => inspectRun(state, runId))),
      fork: (input) => modifyState((state) => fork(state, input)),
      rewind: (input) => modifyState((state) => rewind(state, input)),
      snapshot: (runId) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            Effect.gen(function* () {
              const run = state.runs.get(runId)
              if (run === undefined) return yield* RunNotFound.make({ runId })
              const projection = {
                inspection: toInspection(state, run),
                rootRunId: run.rootRunId,
                events: run.events,
                firstTreePosition: 0,
              }
              if (run.parentRunId !== undefined) Object.assign(projection, { parentRunId: run.parentRunId })
              if (run.invocationId !== undefined) Object.assign(projection, { invocationId: run.invocationId })
              if (run.terminalEventId !== undefined) Object.assign(projection, { terminalEventId: run.terminalEventId })
              return yield* projectRunSnapshot(projection)
            }),
          ),
        ),
      acknowledge: (input) => update((state) => acknowledge(state, input)),
      acknowledged: (runId) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => loadAcknowledged(state, runId))),
      ...makeHostSessionStore({ stateRef, modifyState }),
      sessionRoots: (sessionId) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.map((state) =>
            [...state.runs.values()]
              .filter((run) => run.rootRunId === run.runId && run.message.sessionId === sessionId)
              .map((run) => run.runId),
          ),
        ),
      treeCheckpoint: (rootRunId) =>
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
                const projection = {
                  inspection: toInspection(state, run),
                  rootRunId,
                  events: run.events,
                  firstTreePosition: first.get(run.runId) ?? -1,
                }
                if (run.parentRunId !== undefined) Object.assign(projection, { parentRunId: run.parentRunId })
                if (run.invocationId !== undefined) Object.assign(projection, { invocationId: run.invocationId })
                if (run.terminalEventId !== undefined)
                  Object.assign(projection, { terminalEventId: run.terminalEventId })
                runs.push(projection)
              }
              return yield* projectTreeCheckpoint(rootRunId, makeTreeCursor(rootRunId, root.lastPosition), runs)
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
      treeReplay: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            Effect.gen(function* () {
              const root = state.treeRoots.get(input.rootRunId)
              if (root === undefined) return yield* RunNotFound.make({ runId: input.rootRunId })
              if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000) {
                return yield* TreeReplayLimitInvalid.make({
                  received: String(input.limit),
                  minimum: 1,
                  maximum: 1000,
                })
              }
              if (input.position > root.lastPosition) {
                return yield* TreeCursorFuture.make({
                  rootRunId: input.rootRunId,
                  cursor: makeTreeCursor(input.rootRunId, input.position),
                  latestCursor: makeTreeCursor(input.rootRunId, root.lastPosition),
                })
              }
              if (input.position < root.earliestPosition - 1) {
                return yield* TreeCursorExpired.make({
                  rootRunId: input.rootRunId,
                  cursor: makeTreeCursor(input.rootRunId, input.position),
                  earliestCursor: makeTreeCursor(input.rootRunId, root.earliestPosition - 1),
                })
              }
              const events = root.events.slice(input.position + 1, input.position + 1 + input.limit)
              const position = events.length === 0 ? input.position : input.position + events.length
              return {
                events,
                cursor: makeTreeCursor(input.rootRunId, position),
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
            return ordered.slice(0, input.limit).map((run) => toInspection(state, run))
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
                    const followUp = pending.filter((entry) => entry.policy === "enqueue")
                    const selected =
                      followUp.length > 0 ? followUp : pending.filter((entry) => entry.policy !== "enqueue")
                    const continuation = {
                      schemaVersion: 1 as const,
                      prompt: selected.reduce<Prompt.Prompt>(
                        (prompt, entry) => Prompt.concat(prompt, entry.prompt),
                        Prompt.empty,
                      ),
                      nextTurn: input.result.turns,
                      steeringEntryIds: selected.map((entry) => entry.entryId),
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
                  return [outcome, revokeSession(yield* complete({ ...state, runs }, input), input)] as const
                }))(),
            ),
          ),
        ),
      fail: (input) =>
        fencedUpdate(input, (state) => fail(state, input).pipe(Effect.map((next) => revokeSession(next, input)))),
      suspend: (input) =>
        fencedUpdate(input, (state) => suspend(state, input).pipe(Effect.map((next) => revokeSession(next, input)))),
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
      operationCancellations: (input) =>
        fencedModify(input, (state) =>
          operationCancellations(state, input).pipe(Effect.map((records) => [records, state] as const)),
        ),
      acknowledgeOperationCancellation: (input) =>
        fencedModify(input, (state) => acknowledgeOperationCancellation(state, input)),
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
                : (() => {
                    const cancellation = { runId: input.runId }
                    if (run.cancelReason !== undefined) Object.assign(cancellation, { reason: run.cancelReason })
                    return cancel(resolved, cancellation)
                  })()
            }),
          ),
        ),
      recoveryJournal: (runId) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => recoveryJournal(state, runId))),
      retryRecovery: (input) => update((state) => retryRecovery(state, input)),
      wakeRecovery: (input) => update((state) => wakeRecovery(state, input)),
      extendBudgetRecovery: (input) =>
        modifyState((state) =>
          Effect.gen(function* () {
            const explanation = explainRecovery(yield* recoveryJournal(state, input.runId))
            if (!explanation.obligations.some((decision) => decision._tag === "AwaitBudget")) {
              return yield* IllegalOperatorAction.make({
                runId: input.runId,
                decision: explanation.decision,
                action: "extendBudget",
              })
            }
            const [result, extended] = yield* extendBudget(state, input.runId, input.delta)
            const recorded = yield* appendOperatorAction(extended, input.runId, input.operator, {
              _tag: "ExtendBudget",
              delta: input.delta,
            })
            return [result, recorded] as const
          }),
        ),
      resolveUnknown: (input) => update((state) => resolveUnknownOperation(state, input)),
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
