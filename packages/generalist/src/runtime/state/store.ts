import type { PreparedObservation } from "./observation.js"
import { occurredAtMillis as preparedOccurredAtMillis } from "./observation.js"
/* eslint-disable max-lines -- one object-backed adapter wires the complete RunStore contract. */
import { Context, Effect, Layer, Option, Stream } from "effect"
import { validate as validatePayload } from "../execution/payload/index.js"
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
import { RunStore, type CompletionOutcome, type ExecutionClaim } from "../run/store.js"
import { Activation, StoreActivation, makeActivation, make as makeState, type Options } from "../../durability/internal/runtime.js"
import type { Definition } from "../../durability/internal/runtime-command.js"
import { commands as admissionCommands } from "../../durability/internal/runtime-command-admission.js"
import { commands as operationCommands } from "../../durability/internal/runtime-command-operation.js"
import { commands as controlCommands, externalCommands } from "../../durability/internal/runtime-command-control.js"
import { idempotencyKey, type RuntimeState } from "./state.js"
import { admitSend, admitSpawn, admitStart } from "./store/admit.js"
import { activateRoot } from "./store/activate.js"
import { extendBudget } from "./store/control/budget.js"
import { admitProgramChild, admitProgramChildrenAndSuspend } from "./store/child/admit-program-child.js"
import { cancel, complete, emitAgentEvent, fail, respond, resume, signal, suspend } from "./store/control.js"
import { respondApproval } from "./store/approval.js"
import { isTerminal } from "../run.js"
import { followEvents, followTreeChanges, inspectRun, toInspection } from "./store/events.js"
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
import { claimedStore as claimedSessionStore } from "./session-store.js"
import { reader as sessionReader } from "./session-reader.js"
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
import { acknowledge, loadAcknowledged } from "./store/acknowledgement.js"
import { make as makeHostSessionStore } from "./store/host-session.js"
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
import { appendLifecycle } from "./append.js"
import { make as makeArtifactStore } from "./store/artifact/index.js"
const commands = { ...admissionCommands, ...operationCommands, ...controlCommands }

const makeStoreServices = (options: Options) =>
  Effect.gen(function* () {
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    const { stateRef, readState, modifyState, lookupReceipt, ownership, activation } = yield* makeState(options)
    const update = <Input, E>(
      definition: Definition<Input, void>,
      input: Input,
      transition: (state: RuntimeState, input: Input) => Effect.Effect<RuntimeState, E, PreparedObservation>,
    ) => modifyState(definition, input, (state, prepared) =>
      transition(state, prepared).pipe(Effect.map((next) => [undefined, next] as const)))
    const fencedUpdate = <Input extends readonly [ExecutionClaim], E>(
      definition: Definition<Input, void>,
      input: Input,
      transition: (state: RuntimeState, input: Input) => Effect.Effect<RuntimeState, E, PreparedObservation>,
    ) => update(definition, input, (state, prepared) =>
      requireExecutionClaim(state, prepared[0]).pipe(
        Effect.andThen(validatePayload({ value: prepared[0], boundary: "transition" })),
        Effect.andThen(transition(state, prepared)),
      ))
    const fencedModify = <Input extends readonly [ExecutionClaim], A, E>(
      definition: Definition<Input, A>,
      input: Input,
      transition: (state: RuntimeState, input: Input) => Effect.Effect<readonly [A, RuntimeState], E, PreparedObservation>,
    ) => modifyState(definition, input, (state, prepared) =>
      requireExecutionClaim(state, prepared[0]).pipe(
        Effect.andThen(validatePayload({ value: prepared[0], boundary: "transition" })),
        Effect.andThen(transition(state, prepared)),
      ))
    const runStore = RunStore.of({
      info: Effect.succeed({ durability: "durable", backend: "object", multiWorker: true }),
      sessionReader: (sessionId) => Effect.succeed(Option.some(sessionReader({ readState, sessionId }))),
      claimedSessionStore: (claim) => Effect.succeed(Option.some(claimedSessionStore({ readState, modifyState, claim }))),
      hasAdmission: (input) =>
        readState.pipe(
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
          yield* validatePayload({ value: input, boundary: "admission" })
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
          return yield* modifyState(commands.admitSend, [input], (state, [input]) => admitSend(state, input))
        }),
      admitStart: (input, startOptions) =>
        validatePayload({ value: input, boundary: "admission" }).pipe(
          Effect.andThen(modifyState(commands.admitStart, [input, startOptions], (state, [input, startOptions]) => admitStart(state, input, startOptions))),
        ),
      activate: (input) => modifyState(commands.activate, [input], (state, [input]) => activateRoot(state, input.runId)),
      extendBudget: (input) => modifyState(commands.extendBudget, [input], (state, [input]) => extendBudget(state, input.runId, input.delta)),
      admitSpawn: (input) =>
        validatePayload({ value: input, boundary: "child admission" }).pipe(
          Effect.andThen(modifyState(commands.admitSpawn, [input], (state, [input]) => admitSpawn(state, input))),
        ),
      admitProgramChild: (input) => fencedModify(commands.admitProgramChild, [input], (state, [input]) => admitProgramChild(state, input)),
      admitProgramChildAndSuspend: (input) =>
        fencedModify(commands.admitProgramChildAndSuspend, [input], (state, [input]) => admitProgramChildrenAndSuspend(state, input)),
      events: (input) => Stream.unwrap(readState.pipe(Effect.as(followEvents(stateRef, input)))),
      respond: (input) => update(commands.respond, [input], (state, [input]) => respond(state, input)),
      respondApproval: (input) =>
        update(commands.respondApproval, [input], (state, [input]) =>
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
      signal: (input) => update(commands.signal, [input], (state, [input]) => signal(state, input)),
      wake: (input) => modifyState(commands.wake, [input], (state, [input]) => wake(state, input)),
      dueAwaitEvents: (input) =>
        readState.pipe(
          Effect.flatMap((state) =>
            state.closed
              ? RuntimeUnavailable.make({ message: "runtime store released" })
              : Effect.succeed(dueAwaitEvents(state, input)),
          ),
        ),
      timeoutAwaitEvent: (input) => modifyState(commands.timeoutAwaitEvent, [input], (state, [input]) => timeoutAwaitEvent(state, input)),
      registerSchedule: (record) =>
        validatePayload({ value: record, boundary: "schedule" }).pipe(
          Effect.andThen(modifyState(commands.registerSchedule, [record], (state, [record]) => registerSchedule(state, record))),
        ),
      claimSchedules: (input) => modifyState(commands.claimSchedules, [input], (state, [input]) => claimSchedules(state, input)),
      advanceSchedule: (input) => update(commands.advanceSchedule, [input], (state, [input]) => advanceSchedule(state, input)),
      cancel: (input) => update(commands.cancel, [input], (state, [input]) => cancel(state, input)),
      cancelSession: (input) => modifyState(commands.cancelSession, [input], (state, [input]) => cancelSession(state, input)),
      admitSteering: (input) => modifyState(commands.admitSteering, [input], (state, [input]) => admitSteering(state, input)),
      admitRollback: (input) =>
        modifyState(commands.admitRollback, [input], (state, [input]) =>
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
              queue: "steering" as const,
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
        readState.pipe(
          Effect.flatMap((state) =>
            Effect.gen(function* () {
              yield* requireExecutionClaim(state, input)
              return yield* readSteering(state, input)
            }),
          ),
        ),
      pendingSteering: (input) =>
        readState.pipe(
          Effect.flatMap((state) => readSteering(state, input)),
          Effect.map((entries) => entries.slice(0, input.limit)),
        ),
      directory: (runId) => readState.pipe(Effect.flatMap((state) => directory(state, runId))),
      resolveAddress: (address) =>
        readState.pipe(Effect.flatMap((state) => resolveAddress(state, address))),
      registerAgentName: (input) => modifyState(commands.registerAgentName, [input], (state, [input]) => registerAgentName(state, input)),
      listRelated: (runId) => readState.pipe(Effect.flatMap((state) => listRelated(state, runId))),
      settlementNotifications: (input) =>
        readState.pipe(Effect.flatMap((state) => settlementNotifications(state, input))),
      inspect: (runId) => readState.pipe(Effect.flatMap((state) => inspectRun(state, runId))),
      fork: (input) =>
        validatePayload({ value: input, boundary: "fork substitution" }).pipe(
          Effect.andThen(modifyState(commands.fork, [input], (state, [input]) => fork(state, input))),
        ),
      rewind: (input) => modifyState(commands.rewind, [input], (state, [input]) => rewind(state, input)),
      snapshot: (runId) =>
        readState.pipe(
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
      acknowledge: (input) => update(commands.acknowledge, [input], (state, [input]) => acknowledge(state, input)),
      acknowledged: (runId) =>
        readState.pipe(Effect.flatMap((state) => loadAcknowledged(state, runId))),
      ...makeHostSessionStore({ stateRef, readState, modifyState }),
      ...makeArtifactStore({
        stateRef,
        readState,
        modifyState,
        lookupReceipt,
        capacity: options.subscriberQueueCapacity ?? 64,
      }),
      sessionRoots: (sessionId) =>
        readState.pipe(
          Effect.map((state) =>
            [...state.runs.values()]
              .filter((run) => run.rootRunId === run.runId && run.message.sessionId === sessionId)
              .map((run) => run.runId),
          ),
        ),
      treeCheckpoint: (rootRunId) =>
        readState.pipe(
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
        readState.pipe(
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
      recordReward: (input) =>
        modifyState(commands.recordReward, [input], (state, [input]) =>
          Effect.gen(function* () {
            if (!state.runs.has(input.runId)) return yield* RunNotFound.make({ runId: input.runId })
            return yield* appendLifecycle(state, input.runId, {
              _tag: "Rewarded",
              leaf: input.leaf,
              value: input.value,
              source: input.source,
            })
          }),
        ).pipe(Effect.asVoid),
      treeReplay: (input) =>
        readState.pipe(
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
      treeChanges: (rootRunId) => Stream.unwrap(readState.pipe(Effect.as(followTreeChanges(stateRef, rootRunId)))),
      list: (input) =>
        readState.pipe(
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
        modifyState(commands.complete, [input], (state, [input]) =>
          requireExecutionClaim(state, input).pipe(
            Effect.andThen(
              ((): Effect.Effect<
                readonly [CompletionOutcome, RuntimeState],
                RunNotFound | RunTerminal | RuntimeUnavailable, PreparedObservation
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
                      queue: followUp.length > 0 ? ("followUp" as const) : ("steering" as const),
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
        fencedUpdate(commands.fail, [input], (state, [input]) => fail(state, input).pipe(Effect.map((next) => revokeSession(next, input)))),
      suspend: (input) =>
        fencedUpdate(commands.suspend, [input], (state, [input]) => suspend(state, input).pipe(Effect.map((next) => revokeSession(next, input)))),
      resume: (input) => update(commands.resume, [input], (state, [input]) => resume(state, input)),
      emitAgentEvent: (input) => fencedUpdate(commands.emitAgentEvent, [input], (state, [input]) => emitAgentEvent(state, input)),
      recordOperation: (input) => fencedModify(commands.recordOperation, [input], (state, [input]) => recordOperation(state, input)),
      startOperation: (input) => fencedModify(commands.startOperation, [input], (state, [input]) => startOperation(state, input)),
      completeOperation: (input) => fencedModify(commands.completeOperation, [input], (state, [input]) => completeOperation(state, input)),
      commitModelResponse: (input) => fencedModify(commands.commitModelResponse, [input], (state, [input]) => commitModelResponse(state, input)),
      commitInterruptedModelResponse: (input) =>
        fencedModify(commands.commitInterruptedModelResponse, [input], (state, [input]) => commitInterruptedModelResponse(state, input)),
      expireRunningOperation: (input) => fencedModify(commands.expireRunningOperation, [input], (state, [input]) => expireRunningOperation(state, input)),
      recoverRunningOperations: (input) => fencedModify(commands.recoverRunningOperations, [input], (state, [input]) => recoverRunningOperations(state, input)),
      getOperation: (input) =>
        readState.pipe(Effect.flatMap((state) => getOperation(state, input))),
      getOperationByKey: (input) =>
        readState.pipe(Effect.flatMap((state) => getOperationByKey(state, input))),
      operationCancellations: (input) =>
        fencedModify(commands.operationCancellations, [input], (state, [input]) =>
          operationCancellations(state, input).pipe(Effect.map((records) => [records, state] as const)),
        ),
      acknowledgeOperationCancellation: (input) =>
        fencedModify(commands.acknowledgeOperationCancellation, [input], (state, [input]) => acknowledgeOperationCancellation(state, input)),
      resolveOperation: (input) =>
        update(commands.resolveOperation, [input], (state, [input]) =>
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
        readState.pipe(Effect.flatMap((state) => recoveryJournal(state, runId))),
      retryRecovery: (input) => update(commands.retryRecovery, [input], (state, [input]) => retryRecovery(state, input)),
      wakeRecovery: (input) => update(commands.wakeRecovery, [input], (state, [input]) => wakeRecovery(state, input)),
      extendBudgetRecovery: (input) =>
        modifyState(commands.extendBudgetRecovery, [input], (state, [input]) =>
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
      resolveUnknown: (input) =>
        validatePayload({ value: input, boundary: "operator resolution" }).pipe(
          Effect.andThen(update(commands.resolveUnknown, [input], (state, [input]) => resolveUnknownOperation(state, input))),
        ),
      claimExecution: (input) => ownership.require(input.ownerId).pipe(Effect.flatMap((authority) =>
        modifyState(commands.claimExecution, [input], (state, [input]) => Effect.gen(function* () {
          const now = yield* preparedOccurredAtMillis
          const lease = state.workers.get(input.ownerId)
          if (lease === undefined || lease.expiresAt <= now || lease.incarnation !== authority.incarnation) {
            return yield* RuntimeUnavailable.make({ message: `Worker ${input.ownerId} has no live activation lease` })
          }
          return yield* claimExecution(state, input)
        })))),
      loadExecution: (runId) =>
        readState.pipe(Effect.flatMap((state) => loadExecution(state, runId))),
      releaseExecution: (input) => modifyState(commands.releaseExecution, [input], (state, [input]) => releaseExecution(state, input)),
      saveExecution: (input) =>
        validatePayload({ value: input, boundary: "checkpoint" }).pipe(
          Effect.andThen(update(commands.saveExecution, [input], (state, [input]) => saveExecution(state, input))),
        ),
      retryExecution: (input) => modifyState(commands.retryExecution, [input], (state, [input]) => retryExecution(state, input)),
      admitFanOut: (input) =>
        validatePayload({ value: input, boundary: "child admission" }).pipe(
          Effect.andThen(modifyState(commands.admitFanOut, [input], (state, [input]) => admitFanOut(state, input))),
        ),
      inspectFanOut: (fanOutId) =>
        readState.pipe(Effect.flatMap((state) => inspectFanOut(state, fanOutId))),
      reserveProgramOperation: (input) => fencedModify(commands.reserveProgramOperation, [input], (state, [input]) => reserveProgramOperation(state, input)),
      suspendProgramOperation: (input) => fencedModify(commands.suspendProgramOperation, [input], (state, [input]) => suspendProgramOperation(state, input)),
      admitProgramAgents: (input) => fencedModify(commands.admitProgramAgents, [input], (state, [input]) => admitProgramAgents(state, input)),
      settleProgramOperation: (input) => fencedModify(commands.settleProgramOperation, [input], (state, [input]) => settleProgramOperation(state, input)),
      startProgramOperation: (input) => fencedModify(commands.startProgramOperation, [input], (state, [input]) => startProgramOperation(state, input)),
      loadProgramState: (runId) =>
        readState.pipe(
          Effect.flatMap((state) =>
            state.runs.has(runId)
              ? Effect.succeed(state.programStates.get(runId))
              : Effect.fail(RunNotFound.make({ runId })),
          ),
        ),
      getProgramOperation: (input) =>
        readState.pipe(
          Effect.flatMap((state) =>
            state.runs.has(input.runId)
              ? Effect.succeed(state.programOperations.get(`${input.runId}\0${input.operation}`))
              : Effect.fail(RunNotFound.make({ runId: input.runId })),
          ),
        ),
      completeProgram: (input) => fencedModify(commands.completeProgram, [input], (state, [input]) => completeProgram(state, input)),
      commitProgramLog: (input) => fencedModify(commands.commitProgramLog, [input], (state, [input]) => commitProgramLog(state, input)),
    })
    const externalChildStore = ExternalChildStore.of({
      reserve: (input) => modifyState(externalCommands.reserve, [input], (state, [input]) => externalChildOperations.reserve(state, input)),
      acknowledge: (placementId) => modifyState(externalCommands.acknowledge, [placementId], (state, [placementId]) => externalChildOperations.acknowledge(state, placementId)),
      settle: (input) => modifyState(externalCommands.settle, [input], (state, [input]) => externalChildOperations.settle(state, input)),
      cancel: (placementId) => modifyState(externalCommands.cancel, [placementId], (state, [placementId]) => externalChildOperations.cancel(state, placementId)),
      admitRoot: (input) => modifyState(externalCommands.admitRoot, [input], (state, [input]) => externalChildOperations.admitRoot(state, input)),
      activateRoot: (placementId) => modifyState(externalCommands.activateRoot, [placementId], (state, [placementId]) => externalChildOperations.activateRoot(state, placementId)),
      inspectRoot: (placementId) =>
        readState.pipe(
          Effect.flatMap((state) => externalChildOperations.inspectRoot(state, placementId)),
        ),
      cancelRoot: (placementId, reason) =>
        modifyState(externalCommands.cancelRoot, [placementId, reason], (state, [placementId, reason]) => externalChildOperations.cancelRoot(state, placementId, reason)),
      rootSettlement: (placementId) =>
        readState.pipe(
          Effect.flatMap((state) => externalChildOperations.rootSettlement(state, placementId)),
        ),
      acknowledgeRootSettlement: (input) =>
        modifyState(externalCommands.acknowledgeRootSettlement, [input], (state, [input]) => externalChildOperations.acknowledgeRootSettlement(state, input)),
    })
    return { runStore, externalChildStore, activation }
  })
export const makeRunStore = (options: Options) =>
  makeStoreServices(options).pipe(Effect.map(({ runStore }) => runStore))
export const layerRunStore = (options: Options) =>
  Layer.effectContext(
    makeStoreServices(options).pipe(
      Effect.map(({ runStore, externalChildStore, activation }) =>
        Context.make(RunStore, runStore).pipe(
          Context.add(ExternalChildStore, externalChildStore),
          Context.add(StoreActivation, activation),
          Context.add(Activation, makeActivation(activation.acquire.pipe(Effect.map(({ monitor }) => monitor)))),
        ),
      ),
    ),
  )
