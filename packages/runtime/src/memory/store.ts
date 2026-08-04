import { Effect, Layer, SynchronizedRef } from "effect"
import {
  AddressNotFound,
  CursorExpired,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  TreeCursorExpired,
  TreeCursorInvalid,
} from "../errors.js"
import { RunStore, type CompletionOutcome } from "../run-store.js"
import type { LayerOptions } from "../runtime.js"
import { emptyState, type MemoryState } from "./state.js"
import { admitSend, admitSpawn } from "./store-admit.js"
import { cancel, complete, emitAgentEvent, fail, respond, resume, signal, suspend } from "./store-control.js"
import { followEvents, inspectRun, shutdownStore, toInspection } from "./store-events.js"
import {
  expireRunningOperation,
  getOperation,
  getOperationByKey,
  recordOperation,
  startOperation,
  completeOperation,
  resolveOperation,
} from "./store-operations.js"
import { claimExecution, loadExecution, requireExecutionClaim, saveExecution } from "./store-execution.js"
import { admitSteering, readSteering } from "./store-steering.js"
import { Prompt } from "effect/unstable/ai"
import { admitFanOut, inspectFanOut } from "./store-fan-out.js"
import { makeCursor } from "../tree-cursor.js"
import { projectRunSnapshot, projectTreeInspection, type InspectionRun } from "../inspection.js"
import { decodePinned, equals } from "../executable-manifest.js"

export const makeRunStore = (options: LayerOptions) =>
  Effect.gen(function* () {
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    const stateRef = yield* SynchronizedRef.make(
      emptyState({
        addressBindings,
        subscriberQueueCapacity: options.subscriberQueueCapacity ?? 64,
      }),
    )
    yield* Effect.addFinalizer(() => shutdownStore(stateRef))

    const update = <E>(transition: (state: MemoryState) => Effect.Effect<MemoryState, E>) =>
      SynchronizedRef.modifyEffect(stateRef, (state) =>
        transition(state).pipe(Effect.map((next) => [undefined, next] as const)),
      ).pipe(Effect.asVoid)
    const fencedUpdate = <E>(
      input: import("../run-store.js").ExecutionClaim,
      transition: (state: MemoryState) => Effect.Effect<MemoryState, E>,
    ) => update((state) => requireExecutionClaim(state, input).pipe(Effect.andThen(transition(state))))
    const fencedModify = <A, E>(
      input: import("../run-store.js").ExecutionClaim,
      transition: (state: MemoryState) => Effect.Effect<readonly [A, MemoryState], E>,
    ) =>
      SynchronizedRef.modifyEffect(stateRef, (state) =>
        requireExecutionClaim(state, input).pipe(Effect.andThen(transition(state))),
      )

    return RunStore.of({
      info: Effect.succeed({ durability: "ephemeral", backend: "memory", multiWorker: false }),
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
          return yield* SynchronizedRef.modifyEffect(stateRef, (state) => admitSend(state, input))
        }),
      admitSpawn: (input) => SynchronizedRef.modifyEffect(stateRef, (state) => admitSpawn(state, input)),
      events: (input) => followEvents(stateRef, input),
      respond: (input) => update((state) => respond(state, input)),
      signal: (input) => update((state) => signal(state, input)),
      cancel: (input) => update((state) => cancel(state, input)),
      admitSteering: (input) => update((state) => admitSteering(state, input)),
      readSteering: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.flatMap((state) =>
            Effect.gen(function* () {
              yield* requireExecutionClaim(state, input)
              return yield* readSteering(state, input)
            }),
          ),
        ),
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
      list: (input) =>
        SynchronizedRef.get(stateRef).pipe(
          Effect.map((state) =>
            [...state.runs.values()]
              .filter((run) => input.status === undefined || run.status === input.status)
              .slice(0, input.limit)
              .map(toInspection),
          ),
        ),
      complete: (input) =>
        SynchronizedRef.modifyEffect(stateRef, (state) =>
          requireExecutionClaim(state, input).pipe(
            Effect.andThen(
              ((): Effect.Effect<
                readonly [CompletionOutcome, MemoryState],
                RunNotFound | RunTerminal | RuntimeUnavailable
              > =>
                Effect.gen(function* () {
                  const run = state.runs.get(input.runId)!
                  const pending = run.steering.filter((entry) => entry.consumedOperationId === undefined)
                  if (pending.length > 0) {
                    const continuation = {
                      schemaVersion: 1 as const,
                      prompt: pending.reduce<Prompt.Prompt>(
                        (prompt, entry) => Prompt.concat(prompt, entry.prompt),
                        Prompt.empty,
                      ),
                      history: input.result.transcript,
                      nextTurn: input.result.turns,
                      steeringEntryIds: pending.map((entry) => entry.entryId),
                    }
                    const runs = new Map(state.runs)
                    runs.set(run.runId, { ...run, transcript: input.result.transcript, continuation })
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
      expireRunningOperation: (input) => fencedModify(input, (state) => expireRunningOperation(state, input)),
      getOperation: (input) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => getOperation(state, input))),
      getOperationByKey: (input) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => getOperationByKey(state, input))),
      resolveOperation: (input) => update((state) => resolveOperation(state, input)),
      claimExecution: (input) => SynchronizedRef.modifyEffect(stateRef, (state) => claimExecution(state, input)),
      loadExecution: (runId) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => loadExecution(state, runId))),
      saveExecution: (input) => update((state) => saveExecution(state, input)),
      admitFanOut: (input) => SynchronizedRef.modifyEffect(stateRef, (state) => admitFanOut(state, input)),
      inspectFanOut: (fanOutId) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => inspectFanOut(state, fanOutId))),
    })
  })

export const layerMemory = (options: LayerOptions): Layer.Layer<RunStore> =>
  Layer.effect(RunStore, makeRunStore(options))
