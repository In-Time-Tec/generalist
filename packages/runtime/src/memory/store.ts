import { Effect, Layer, SynchronizedRef } from "effect"
import { AddressNotFound, CursorExpired, RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import { RunStore, type CompletionOutcome } from "../run-store.js"
import type { LayerOptions } from "../runtime.js"
import { agentKey, emptyState, type MemoryState } from "./state.js"
import { admitSend, admitSpawn } from "./store-admit.js"
import {
  cancel,
  complete,
  emitAgentEvent,
  fail,
  markOperationUnknown,
  respond,
  resume,
  signal,
  wait,
} from "./store-control.js"
import { followEvents, inspectRun, shutdownStore, toInspection } from "./store-events.js"
import {
  expireRunningOperation,
  failOperation,
  getOperation,
  getOperationByKey,
  recordOperation,
  startOperation,
  succeedOperation,
} from "./store-operations.js"
import { claimExecution, loadExecution, requireExecutionClaim, saveExecution } from "./store-execution.js"
import { admitSteering, readSteering } from "./store-steering.js"
import { Prompt } from "effect/unstable/ai"

const registrationMaps = (options: LayerOptions) => {
  const agentRefs = new Map(options.agents.map((entry) => [agentKey(entry.ref), entry.ref] as const))
  const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.agent] as const))
  return { agentRefs, addressBindings }
}

export const makeRunStore = (options: LayerOptions) =>
  Effect.gen(function* () {
    const { agentRefs, addressBindings } = registrationMaps(options)
    for (const binding of options.addresses) {
      if (!agentRefs.has(agentKey(binding.agent))) {
        return yield* Effect.die(new Error(`address ${binding.address} binds unregistered agent`))
      }
    }
    const stateRef = yield* SynchronizedRef.make(
      emptyState({
        agentRefs,
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
          if (
            bound.id !== input.agent.id ||
            bound.version !== input.agent.version ||
            bound.digest !== input.agent.digest
          ) {
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
      wait: (input) => fencedUpdate(input, (state) => wait(state, input)),
      resume: (input) => update((state) => resume(state, input)),
      emitAgentEvent: (input) => fencedUpdate(input, (state) => emitAgentEvent(state, input)),
      markOperationUnknown: (input) => fencedUpdate(input, (state) => markOperationUnknown(state, input)),
      recordOperation: (input) => fencedModify(input, (state) => recordOperation(state, input)),
      startOperation: (input) => fencedModify(input, (state) => startOperation(state, input)),
      succeedOperation: (input) => fencedModify(input, (state) => succeedOperation(state, input)),
      failOperation: (input) => fencedModify(input, (state) => failOperation(state, input)),
      expireRunningOperation: (input) => fencedModify(input, (state) => expireRunningOperation(state, input)),
      getOperation: (input) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => getOperation(state, input))),
      getOperationByKey: (input) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => getOperationByKey(state, input))),
      claimExecution: (input) => SynchronizedRef.modifyEffect(stateRef, (state) => claimExecution(state, input)),
      loadExecution: (runId) =>
        SynchronizedRef.get(stateRef).pipe(Effect.flatMap((state) => loadExecution(state, runId))),
      saveExecution: (input) => update((state) => saveExecution(state, input)),
    })
  })

export const layerMemory = (options: LayerOptions): Layer.Layer<RunStore> =>
  Layer.effect(RunStore, makeRunStore(options))
