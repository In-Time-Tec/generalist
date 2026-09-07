import { occurredAtMillis as preparedOccurredAtMillis, type PreparedObservation } from "./observation.js"
/* eslint-disable max-lines -- one object-backed adapter wires the complete RunStore contract. */
import { Context, Effect, Equal, Layer, Option, Schema, Stream } from "effect"
import { DurabilityFailure } from "../../durability/errors.js"
import {
  ExternalChildPlacementConflict,
  ExternalChildSettlementConflict,
  ExternalRootConflict,
} from "../child/external/placement.js"
import { validate as validatePayload } from "../execution/payload/index.js"
import {
  AddressNotFound,
  ApprovalMismatch,
  AckInvalid,
  CursorExpired,
  IllegalOperatorAction,
  IdempotencyConflict,
  ResponseConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  SteeringConflict,
  TreeCursorExpired,
  TreeCursorFuture,
  TreeReplayLimitInvalid,
} from "../errors.js"
import { RunStore, type CompletionOutcome, type ExecutionClaim } from "../run/store.js"
import { Cursor } from "../cursor.js"
import { StoreActivation, layerActivation, make as makeState, type Options } from "../../durability/internal/runtime.js"
import type { Definition } from "../../durability/internal/runtime-command.js"
import { commands as admissionCommands } from "../../durability/internal/runtime-command-admission.js"
import { commands as operationCommands } from "../../durability/internal/runtime-command-operation.js"
import { commands as controlCommands, externalCommands } from "../../durability/internal/runtime-command-control.js"
import { idempotencyKey, waitMapKey, type RuntimeState } from "./projection.js"
import { admitSend, admitSpawn, admitStart } from "./store/admission/accept.js"
import { normalize as normalizeTreePolicy } from "../tree/policy.js"
import { activateRoot } from "./store/admission/activation.js"
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
  revokeSession,
  retryExecution,
  saveExecution,
} from "./store/execution.js"
import { requireExecutionClaim } from "./store/claim.js"
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
  reservationDivergence,
  resolveProgramOperation,
  suspendProgramOperation,
  settleProgramOperation,
  startProgramOperation,
} from "./store/program.js"
import { externalChildOperations } from "./store/child/external.js"
import { ExternalChildStore } from "../child/external/store.js"
import { acknowledge, loadAcknowledged } from "./store/acknowledgement.js"
import { make as makeHostSessionStore } from "./store/host-session/index.js"
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

const withDomainConflict =
  <Conflict>(conflict: Conflict) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Conflict, R> =>
    effect.pipe(
      Effect.mapError((error) =>
        Schema.is(DurabilityFailure)(error) && error.reason === "input-conflict" ? conflict : error,
      ),
    )

const makeStoreServices = (options: Options) =>
  Effect.gen(function* () {
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    const { stateRef, readState, modifyState, lookupReceipt, ownership, activation } = yield* makeState(options)
    const update = <Input, E>(
      definition: Definition<Input, void>,
      input: Input,
      transition: (state: RuntimeState, input: Input) => Effect.Effect<RuntimeState, E, PreparedObservation>,
    ) =>
      modifyState(definition, input, (state, prepared) =>
        transition(state, prepared).pipe(Effect.map((next) => [undefined, next] as const)),
      )
    const fencedUpdate = <Input extends readonly [ExecutionClaim], E>(
      definition: Definition<Input, void>,
      input: Input,
      transition: (state: RuntimeState, input: Input) => Effect.Effect<RuntimeState, E, PreparedObservation>,
    ) =>
      update(definition, input, (state, prepared) =>
        requireExecutionClaim(state, prepared[0]).pipe(
          Effect.andThen(validatePayload({ value: prepared[0], boundary: "transition" })),
          Effect.andThen(transition(state, prepared)),
        ),
      )
    const fencedModify = <Input extends readonly [ExecutionClaim], A, E>(
      definition: Definition<Input, A>,
      input: Input,
      transition: (
        state: RuntimeState,
        input: Input,
      ) => Effect.Effect<readonly [A, RuntimeState], E, PreparedObservation>,
    ) =>
      modifyState(definition, input, (state, prepared) =>
        requireExecutionClaim(state, prepared[0]).pipe(
          Effect.andThen(validatePayload({ value: prepared[0], boundary: "transition" })),
          Effect.andThen(transition(state, prepared)),
        ),
      )
    const runStore = RunStore.of({
      info: Effect.succeed({ durability: "durable", backend: "object", multiWorker: true }),
      sessionReader: (sessionId) => Effect.succeed(Option.some(sessionReader({ readState, sessionId }))),
      claimedSessionStore: (claim) =>
        Effect.succeed(Option.some(claimedSessionStore({ readState, modifyState, claim }))),
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
          yield* normalizeTreePolicy(input.treePolicy)
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
          return yield* modifyState(commands.admitSend, [input], (state, [preparedInput]) =>
            admitSend(state, preparedInput),
          )
        }),
      admitStart: (input, startOptions) =>
        normalizeTreePolicy(input.treePolicy).pipe(
          Effect.andThen(validatePayload({ value: input, boundary: "admission" })),
          Effect.andThen(
            modifyState(commands.admitStart, [input, startOptions], (state, [preparedInput, preparedStartOptions]) =>
              admitStart(state, preparedInput, preparedStartOptions),
            ),
          ),
        ),
      activate: (input) =>
        modifyState(commands.activate, [input], (state, [preparedInput]) => activateRoot(state, preparedInput.runId)),
      extendBudget: (input) =>
        modifyState(commands.extendBudget, [input], (state, [preparedInput]) =>
          extendBudget(state, preparedInput.runId, preparedInput.delta),
        ),
      admitSpawn: (input) =>
        validatePayload({ value: input, boundary: "child admission" }).pipe(
          Effect.andThen(
            modifyState(commands.admitSpawn, [input], (state, [preparedInput]) => admitSpawn(state, preparedInput)),
          ),
          Effect.catchTag("generalist/durability/DurabilityFailure", (error) => {
            if (error.reason !== "input-conflict") return Effect.fail(error)
            return readState.pipe(
              Effect.flatMap((state) => {
                const existing = state.idempotency.get(
                  idempotencyKey(input.message.to, input.message.sessionId, input.message.idempotencyKey),
                )
                return Effect.fail(
                  existing === undefined
                    ? error
                    : IdempotencyConflict.make({
                        address: input.message.to,
                        sessionId: input.message.sessionId,
                        idempotencyKey: input.message.idempotencyKey,
                        existingRunId: existing.receipt.runId,
                      }),
                )
              }),
            )
          }),
        ),
      admitProgramChild: (input) =>
        fencedModify(commands.admitProgramChild, [input], (state, [preparedInput]) =>
          admitProgramChild(state, preparedInput),
        ),
      admitProgramChildAndSuspend: (input) =>
        fencedModify(commands.admitProgramChildAndSuspend, [input], (state, [preparedInput]) =>
          admitProgramChildrenAndSuspend(state, preparedInput),
        ),
      events: (input) => Stream.unwrap(readState.pipe(Effect.as(followEvents(stateRef, input)))),
      respond: (input) =>
        update(commands.respond, [input], (state, [preparedInput]) => respond(state, preparedInput)).pipe(
          withDomainConflict(ResponseConflict.make({ runId: input.runId, waitId: input.waitId })),
        ),
      respondApproval: (input) =>
        update(commands.respondApproval, [input], (state, [preparedInput]) =>
          respondApproval(state, preparedInput).pipe(
            Effect.flatMap((responded) =>
              preparedInput.operator === undefined
                ? Effect.succeed(responded)
                : appendOperatorAction(responded, preparedInput.runId, preparedInput.operator, {
                    _tag: "ResolveApproval",
                    token: preparedInput.approvalId,
                    decision: preparedInput.decision,
                  }),
            ),
          ),
        ).pipe(
          Effect.catchTag("generalist/durability/DurabilityFailure", (error) => {
            if (error.reason !== "input-conflict") return Effect.fail(error)
            return readState.pipe(
              Effect.flatMap((state) => {
                const wait = state.waits.get(waitMapKey(input.runId, input.approvalId))
                return Effect.fail(
                  wait !== undefined &&
                    wait.status !== "open" &&
                    wait.resolution !== undefined &&
                    !Equal.equals(wait.resolution, input.decision)
                    ? ApprovalMismatch.make({ runId: input.runId, approvalId: input.approvalId, mismatch: "decision" })
                    : error,
                )
              }),
            )
          }),
        ),
      signal: (input) => update(commands.signal, [input], (state, [preparedInput]) => signal(state, preparedInput)),
      wake: (input) => modifyState(commands.wake, [input], (state, [preparedInput]) => wake(state, preparedInput)),
      dueAwaitEvents: (input) =>
        readState.pipe(
          Effect.flatMap((state) =>
            state.closed
              ? RuntimeUnavailable.make({ message: "runtime store released" })
              : Effect.succeed(dueAwaitEvents(state, input)),
          ),
        ),
      timeoutAwaitEvent: (input) =>
        modifyState(commands.timeoutAwaitEvent, [input], (state, [preparedInput]) =>
          timeoutAwaitEvent(state, preparedInput),
        ),
      registerSchedule: (record) =>
        validatePayload({ value: record, boundary: "schedule" }).pipe(
          Effect.andThen(
            modifyState(commands.registerSchedule, [record], (state, [preparedRecord]) =>
              registerSchedule(state, preparedRecord),
            ),
          ),
        ),
      claimSchedules: (input) =>
        modifyState(commands.claimSchedules, [input], (state, [preparedInput]) => claimSchedules(state, preparedInput)),
      advanceSchedule: (input) =>
        update(commands.advanceSchedule, [input], (state, [preparedInput]) => advanceSchedule(state, preparedInput)),
      cancel: (input) => update(commands.cancel, [input], (state, [preparedInput]) => cancel(state, preparedInput)),
      cancelSession: (input) =>
        modifyState(commands.cancelSession, [input], (state, [preparedInput]) => cancelSession(state, preparedInput)),
      admitSteering: (input) =>
        modifyState(commands.admitSteering, [input], (state, [preparedInput]) =>
          admitSteering(state, preparedInput),
        ).pipe(withDomainConflict(SteeringConflict.make({ runId: input.runId, idempotencyKey: input.idempotencyKey }))),
      admitRollback: (input) =>
        modifyState(commands.admitRollback, [input], (state, [preparedInput]) =>
          Effect.gen(function* () {
            const source = state.runs.get(preparedInput.runId)
            if (source === undefined) return yield* RunNotFound.make({ runId: preparedInput.runId })
            const prior = source.events.some(
              (event) => event._tag === "Inbox" && event.idempotencyKey === preparedInput.idempotencyKey,
            )
            if (prior) return yield* admitSteering(state, preparedInput)
            const [, rewound] = yield* rewind(state, {
              runId: preparedInput.runId,
              branchRunId: preparedInput.branchRunId,
              toSequence: Math.max(0, source.lastTurnCompletedSequence),
            })
            const [admission, admitted] = yield* admitSteering(rewound, preparedInput)
            const run = admitted.runs.get(preparedInput.runId)
            if (run === undefined) return yield* RunNotFound.make({ runId: preparedInput.runId })
            const previousTurn = run.events.findLast(
              (event): event is Extract<RunEvent, { readonly _tag: "TurnCompleted" }> => event._tag === "TurnCompleted",
            )
            const continuation = {
              schemaVersion: 1 as const,
              queue: "steering" as const,
              prompt: preparedInput.prompt,
              nextTurn: (previousTurn?.turn ?? -1) + 1,
              steeringEntryIds: [admission.receipt.entryId],
            }
            const prepared = {
              ...admitted,
              runs: new Map(admitted.runs).set(preparedInput.runId, { ...run, continuation }),
            }
            const [, activated] = yield* activateRoot(prepared, preparedInput.runId)
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
      resolveAddress: (address) => readState.pipe(Effect.flatMap((state) => resolveAddress(state, address))),
      registerAgentName: (input) =>
        modifyState(commands.registerAgentName, [input], (state, [preparedInput]) =>
          registerAgentName(state, preparedInput),
        ),
      listRelated: (runId) => readState.pipe(Effect.flatMap((state) => listRelated(state, runId))),
      settlementNotifications: (input) =>
        readState.pipe(Effect.flatMap((state) => settlementNotifications(state, input))),
      inspect: (runId) => readState.pipe(Effect.flatMap((state) => inspectRun(state, runId))),
      fork: (input) =>
        validatePayload({ value: input, boundary: "fork substitution" }).pipe(
          Effect.andThen(modifyState(commands.fork, [input], (state, [preparedInput]) => fork(state, preparedInput))),
        ),
      rewind: (input) =>
        modifyState(commands.rewind, [input], (state, [preparedInput]) => rewind(state, preparedInput)),
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
      acknowledge: (input) =>
        Schema.is(Cursor)(input.sequence)
          ? update(commands.acknowledge, [input], (state, [preparedInput]) => acknowledge(state, preparedInput))
          : AckInvalid.make({
              runId: input.runId,
              sequence: input.sequence,
              message: "acknowledged sequence must be -1 or a safe integer",
            }),
      acknowledged: (runId) => readState.pipe(Effect.flatMap((state) => loadAcknowledged(state, runId))),
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
        modifyState(commands.recordReward, [input], (state, [preparedInput]) =>
          Effect.gen(function* () {
            if (!state.runs.has(preparedInput.runId)) return yield* RunNotFound.make({ runId: preparedInput.runId })
            const [, next] = yield* appendLifecycle(state, preparedInput.runId, {
              _tag: "Rewarded",
              leaf: preparedInput.leaf,
              value: preparedInput.value,
              source: preparedInput.source,
            })
            return [undefined, next] as const
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
        modifyState(commands.complete, [input], (state, [preparedInput]) =>
          requireExecutionClaim(state, preparedInput).pipe(
            Effect.andThen(
              ((): Effect.Effect<
                readonly [CompletionOutcome, RuntimeState],
                RunNotFound | RunTerminal | RuntimeUnavailable,
                PreparedObservation
              > =>
                Effect.gen(function* () {
                  const run = state.runs.get(preparedInput.runId)!
                  const pending = run.steering.filter(
                    (entry) => entry.consumedOperationId === undefined && entry.discardedReason === undefined,
                  )
                  if (!run.cancellationRequested && pending.length > 0 && "session" in preparedInput.result) {
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
                      nextTurn: preparedInput.result.turns,
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
                  return [
                    outcome,
                    revokeSession(yield* complete({ ...state, runs }, preparedInput), preparedInput),
                  ] as const
                }))(),
            ),
          ),
        ),
      fail: (input) =>
        fencedUpdate(commands.fail, [input], (state, [preparedInput]) =>
          fail(state, preparedInput).pipe(Effect.map((next) => revokeSession(next, preparedInput))),
        ),
      suspend: (input) =>
        fencedUpdate(commands.suspend, [input], (state, [preparedInput]) =>
          suspend(state, preparedInput).pipe(Effect.map((next) => revokeSession(next, preparedInput))),
        ),
      resume: (input) => update(commands.resume, [input], (state, [preparedInput]) => resume(state, preparedInput)),
      emitAgentEvent: (input) =>
        fencedUpdate(commands.emitAgentEvent, [input], (state, [preparedInput]) =>
          emitAgentEvent(state, preparedInput),
        ),
      recordOperation: (input) =>
        fencedModify(commands.recordOperation, [input], (state, [preparedInput]) =>
          recordOperation(state, preparedInput),
        ),
      startOperation: (input) =>
        fencedModify(commands.startOperation, [input], (state, [preparedInput]) =>
          startOperation(state, preparedInput),
        ),
      completeOperation: (input) =>
        fencedModify(commands.completeOperation, [input], (state, [preparedInput]) =>
          completeOperation(state, preparedInput),
        ),
      commitModelResponse: (input) =>
        fencedModify(commands.commitModelResponse, [input], (state, [preparedInput]) =>
          commitModelResponse(state, preparedInput),
        ),
      commitInterruptedModelResponse: (input) =>
        fencedModify(commands.commitInterruptedModelResponse, [input], (state, [preparedInput]) =>
          commitInterruptedModelResponse(state, preparedInput),
        ),
      expireRunningOperation: (input) =>
        fencedModify(commands.expireRunningOperation, [input], (state, [preparedInput]) =>
          expireRunningOperation(state, preparedInput),
        ),
      recoverRunningOperations: (input) =>
        fencedModify(commands.recoverRunningOperations, [input], (state, [preparedInput]) =>
          recoverRunningOperations(state, preparedInput),
        ),
      getOperation: (input) => readState.pipe(Effect.flatMap((state) => getOperation(state, input))),
      getOperationByKey: (input) => readState.pipe(Effect.flatMap((state) => getOperationByKey(state, input))),
      operationCancellations: (input) =>
        fencedModify(commands.operationCancellations, [input], (state, [preparedInput]) =>
          operationCancellations(state, preparedInput).pipe(Effect.map((records) => [records, state] as const)),
        ),
      acknowledgeOperationCancellation: (input) =>
        fencedModify(commands.acknowledgeOperationCancellation, [input], (state, [preparedInput]) =>
          acknowledgeOperationCancellation(state, preparedInput),
        ),
      resolveOperation: (input) =>
        update(commands.resolveOperation, [input], (state, [preparedInput]) =>
          (state.programOperations.has(`${preparedInput.runId}\0${preparedInput.operationId}`)
            ? resolveProgramOperation(state, preparedInput)
            : resolveOperation(state, preparedInput)
          ).pipe(
            // A resolved unknown outcome must settle a cancellation that was admitted while it was pending.
            Effect.flatMap((resolved) => {
              const run = resolved.runs.get(preparedInput.runId)
              return run === undefined || !run.cancellationRequested || isTerminal(run.status)
                ? Effect.succeed(resolved)
                : (() => {
                    const cancellation = { runId: preparedInput.runId }
                    if (run.cancelReason !== undefined) Object.assign(cancellation, { reason: run.cancelReason })
                    return cancel(resolved, cancellation)
                  })()
            }),
          ),
        ),
      recoveryJournal: (runId) => readState.pipe(Effect.flatMap((state) => recoveryJournal(state, runId))),
      retryRecovery: (input) =>
        update(commands.retryRecovery, [input], (state, [preparedInput]) => retryRecovery(state, preparedInput)),
      wakeRecovery: (input) =>
        update(commands.wakeRecovery, [input], (state, [preparedInput]) => wakeRecovery(state, preparedInput)),
      extendBudgetRecovery: (input) =>
        modifyState(commands.extendBudgetRecovery, [input], (state, [preparedInput]) =>
          Effect.gen(function* () {
            const explanation = explainRecovery(yield* recoveryJournal(state, preparedInput.runId))
            if (!explanation.obligations.some((decision) => decision._tag === "AwaitBudget")) {
              return yield* IllegalOperatorAction.make({
                runId: preparedInput.runId,
                decision: explanation.decision,
                action: "extendBudget",
              })
            }
            const [result, extended] = yield* extendBudget(state, preparedInput.runId, preparedInput.delta)
            const recorded = yield* appendOperatorAction(extended, preparedInput.runId, preparedInput.operator, {
              _tag: "ExtendBudget",
              delta: preparedInput.delta,
            })
            return [result, recorded] as const
          }),
        ),
      resolveUnknown: (input) =>
        validatePayload({ value: input, boundary: "operator resolution" }).pipe(
          Effect.andThen(
            update(commands.resolveUnknown, [input], (state, [preparedInput]) =>
              resolveUnknownOperation(state, preparedInput),
            ),
          ),
        ),
      claimExecution: (input) =>
        ownership.require(input.ownerId).pipe(
          Effect.flatMap((authority) =>
            modifyState(commands.claimExecution, [input], (state, [preparedInput]) =>
              Effect.gen(function* () {
                const now = yield* preparedOccurredAtMillis
                const lease = state.workers.get(preparedInput.ownerId)
                if (lease === undefined || lease.expiresAt <= now || lease.incarnation !== authority.incarnation) {
                  return yield* RuntimeUnavailable.make({
                    message: `Worker ${preparedInput.ownerId} has no live activation lease`,
                  })
                }
                return yield* claimExecution(state, preparedInput)
              }),
            ),
          ),
        ),
      loadExecution: (runId) => readState.pipe(Effect.flatMap((state) => loadExecution(state, runId))),
      releaseExecution: (input) =>
        modifyState(commands.releaseExecution, [input], (state, [preparedInput]) =>
          releaseExecution(state, preparedInput),
        ),
      saveExecution: (input) =>
        validatePayload({ value: input, boundary: "checkpoint" }).pipe(
          Effect.andThen(
            update(commands.saveExecution, [input], (state, [preparedInput]) => saveExecution(state, preparedInput)),
          ),
        ),
      retryExecution: (input) =>
        modifyState(commands.retryExecution, [input], (state, [preparedInput]) => retryExecution(state, preparedInput)),
      admitFanOut: (input) =>
        validatePayload({ value: input, boundary: "child admission" }).pipe(
          Effect.andThen(
            modifyState(commands.admitFanOut, [input], (state, [preparedInput]) => admitFanOut(state, preparedInput)),
          ),
        ),
      inspectFanOut: (fanOutId) => readState.pipe(Effect.flatMap((state) => inspectFanOut(state, fanOutId))),
      reserveProgramOperation: (input) =>
        fencedModify(commands.reserveProgramOperation, [input], (state, [preparedInput]) =>
          reserveProgramOperation(state, preparedInput),
        ).pipe(
          Effect.catchTag("generalist/durability/DurabilityFailure", (error) => {
            if (error.reason !== "input-conflict") return Effect.fail(error)
            return readState.pipe(
              Effect.flatMap((state) => {
                const existing = state.programOperations.get(`${input.runId}\0${input.operation}`)
                return Effect.fail(
                  existing === undefined ? error : (reservationDivergence({ existing, input }) ?? error),
                )
              }),
            )
          }),
        ),
      suspendProgramOperation: (input) =>
        fencedModify(commands.suspendProgramOperation, [input], (state, [preparedInput]) =>
          suspendProgramOperation(state, preparedInput),
        ),
      admitProgramAgents: (input) =>
        fencedModify(commands.admitProgramAgents, [input], (state, [preparedInput]) =>
          admitProgramAgents(state, preparedInput),
        ),
      settleProgramOperation: (input) =>
        fencedModify(commands.settleProgramOperation, [input], (state, [preparedInput]) =>
          settleProgramOperation(state, preparedInput),
        ),
      startProgramOperation: (input) =>
        fencedModify(commands.startProgramOperation, [input], (state, [preparedInput]) =>
          startProgramOperation(state, preparedInput),
        ),
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
      completeProgram: (input) =>
        fencedModify(commands.completeProgram, [input], (state, [preparedInput]) =>
          completeProgram(state, preparedInput),
        ),
      commitProgramLog: (input) =>
        fencedModify(commands.commitProgramLog, [input], (state, [preparedInput]) =>
          commitProgramLog(state, preparedInput),
        ),
    })
    const externalChildStore = ExternalChildStore.of({
      inspectPlacement: (placementId) =>
        readState.pipe(Effect.flatMap((state) => externalChildOperations.inspectPlacement(state, placementId))),
      outstandingPlacements: (input) =>
        readState.pipe(Effect.flatMap((state) => externalChildOperations.outstandingPlacements(state, input))),
      outstandingRoots: (input) =>
        readState.pipe(Effect.flatMap((state) => externalChildOperations.outstandingRoots(state, input))),
      reserve: (input) =>
        validatePayload({ value: input, boundary: "external child reservation" }).pipe(
          Effect.andThen(
            modifyState(externalCommands.reserve, [input], (state, [prepared]) =>
              prepared.request.parent.partition === options.partition
                ? externalChildOperations.reserve(state, prepared)
                : RuntimeUnavailable.make({ message: "External child parent belongs to another partition" }),
            ),
          ),
          withDomainConflict(ExternalChildPlacementConflict.make({ placementId: input.placementId })),
        ),
      acknowledge: (placementId) =>
        modifyState(externalCommands.acknowledge, [placementId], (state, [preparedPlacementId]) =>
          externalChildOperations.acknowledge(state, preparedPlacementId),
        ),
      settle: (input) =>
        modifyState(externalCommands.settle, [input], (state, [preparedInput]) =>
          externalChildOperations.settle(state, preparedInput),
        ).pipe(
          withDomainConflict(
            ExternalChildSettlementConflict.make({ placementId: input.placementId, settlementId: input.settlementId }),
          ),
        ),
      cancel: (placementId) =>
        modifyState(externalCommands.cancel, [placementId], (state, [preparedPlacementId]) =>
          externalChildOperations.cancel(state, preparedPlacementId),
        ),
      admitRoot: (input) =>
        validatePayload({ value: input, boundary: "external root admission" }).pipe(
          Effect.andThen(
            modifyState(externalCommands.admitRoot, [input], (state, [prepared]) =>
              prepared.ref.partition === options.partition
                ? externalChildOperations.admitRoot(state, prepared)
                : RuntimeUnavailable.make({ message: "External root belongs to another partition" }),
            ),
          ),
          withDomainConflict(ExternalRootConflict.make({ placementId: input.placementId })),
        ),
      activateRoot: (placementId) =>
        modifyState(externalCommands.activateRoot, [placementId], (state, [preparedPlacementId]) =>
          externalChildOperations.activateRoot(state, preparedPlacementId),
        ),
      inspectRoot: (placementId) =>
        readState.pipe(Effect.flatMap((state) => externalChildOperations.inspectRoot(state, placementId))),
      cancelRoot: (placementId, reason) =>
        modifyState(
          externalCommands.cancelRoot,
          [placementId, reason],
          (state, [preparedPlacementId, preparedReason]) =>
            externalChildOperations.cancelRoot(state, preparedPlacementId, preparedReason),
        ),
      rootSettlement: (placementId) =>
        readState.pipe(Effect.flatMap((state) => externalChildOperations.rootSettlement(state, placementId))),
      acknowledgeRootSettlement: (input) =>
        modifyState(externalCommands.acknowledgeRootSettlement, [input], (state, [preparedInput]) =>
          externalChildOperations.acknowledgeRootSettlement(state, preparedInput),
        ),
    })
    return { runStore, externalChildStore, activation }
  })
export const makeRunStore = (options: Options) =>
  makeStoreServices(options).pipe(Effect.map(({ runStore }) => runStore))
export const layerRunStore = (options: Options) =>
  Layer.unwrap(
    makeStoreServices(options).pipe(
      Effect.map(({ runStore, externalChildStore, activation }) =>
        layerActivation(activation.acquire).pipe(
          Layer.provideMerge(
            Layer.succeedContext(
              Context.make(RunStore, runStore).pipe(
                Context.add(ExternalChildStore, externalChildStore),
                Context.add(StoreActivation, activation),
              ),
            ),
          ),
        ),
      ),
    ),
  )
