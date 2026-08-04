import { Cause, Context, DateTime, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Agent, AgentEvent, AgentRef, DurableDriver, Steering } from "@batonfx/core"
import { RunStore, type ExecutionClaim } from "./run-store.js"
import type { AgentRegistration } from "./runtime.js"
import { ActiveExecutions } from "./active-executions.js"
import { RunTerminal } from "./errors.js"
import type { ExecutionContinuation } from "./steering.js"
import type { AgentLoopEvent, AgentResult } from "./agent-event.js"

export interface Options {
  readonly workerId: string
  readonly agents: ReadonlyArray<AgentRegistration>
}

export interface Interface {
  readonly execute: (claim: ExecutionClaim) => Effect.Effect<void>
}

export class AgentHost extends Context.Service<AgentHost, Interface>()("@batonfx/runtime/AgentHost") {}

const registrationKey = (ref: { readonly id: string; readonly version: string; readonly digest: string }) =>
  `${ref.id}\0${ref.version}\0${ref.digest}`

const failureMessage = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause)
  return error instanceof Error ? error.message : String(error)
}

export const make = (options: Options): Effect.Effect<Interface, never, RunStore | ActiveExecutions> =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const active = yield* ActiveExecutions
    const registrations = new Map(options.agents.map((entry) => [registrationKey(entry.ref), entry] as const))

    const execute = (claim: ExecutionClaim): Effect.Effect<void> =>
      Effect.gen(function* () {
        const claimed = yield* store.loadExecution(claim.runId)
        if (claimed.attemptFence !== claim.attemptFence) {
          yield* store.saveExecution(claim)
          return
        }
        const runId = claim.runId
        const registration = registrations.get(registrationKey(claimed.agent))
        if (registration === undefined) {
          yield* store.fail({ ...claim, error: { message: "Pinned Agent registration is unavailable" } })
          return
        }
        yield* AgentRef.requireMatch(registration.ref, claimed.agent).pipe(Effect.orDie)

        const runAgent = (
          prompt: Prompt.RawInput,
          history: Prompt.Prompt | undefined,
          initialCheckpoint: DurableDriver.DriverCheckpoint | undefined,
          continuation?: ExecutionContinuation,
        ): Effect.Effect<void> =>
          Effect.gen(function* () {
            const observed = yield* Ref.make<ReadonlyArray<string>>(continuation?.steeringEntryIds ?? [])
            const observedPrompt = yield* Ref.make<Prompt.Prompt | undefined>(continuation?.prompt)
            const activeContinuation = yield* Ref.make(continuation)
            const bufferedEvents = yield* Ref.make<ReadonlyArray<AgentLoopEvent>>(
              continuation === undefined
                ? []
                : [
                    {
                      _tag: "SteeringDrained",
                      turn: Math.max(0, continuation.nextTurn - 1),
                      queue: "steering",
                      count: continuation.steeringEntryIds.length,
                    },
                  ],
            )
            const take = Effect.gen(function* () {
              const current = yield* Ref.get(observed)
              if (current.length > 0) return []
              const entries = yield* store.readSteering(claim)
              yield* Ref.set(
                observed,
                entries.map((entry) => entry.entryId),
              )
              yield* Ref.set(
                observedPrompt,
                entries.reduce<Prompt.Prompt>(
                  (accumulated, entry) => Prompt.concat(accumulated, entry.prompt),
                  Prompt.empty,
                ),
              )
              return entries.map((entry) => ({ prompt: entry.prompt }))
            }).pipe(Effect.orDie)
            const steeringLayer = Steering.layerTest({
              steer: () => Effect.die(new Error("Runtime steering must be admitted through Runtime.steer")),
              followUp: () => Effect.die(new Error("Runtime steering must be admitted through Runtime.steer")),
              takeSteering: take,
              takeFollowUp: take,
            })
            const pendingCompletion = yield* Ref.make<ExecutionContinuation | undefined>(undefined)
            const journal: DurableDriver.DriverJournal = {
              onScheduled: (operation, checkpoint) =>
                Effect.gen(function* () {
                  const steeringEntryIds = operation.kind === "model" ? yield* Ref.get(observed) : []
                  const steeringPrompt = operation.kind === "model" ? yield* Ref.get(observedPrompt) : undefined
                  const steeringEvents = operation.kind === "model" ? yield* Ref.get(bufferedEvents) : []
                  const completed = steeringEvents.findLast((event) => event._tag === "TurnCompleted")
                  const currentContinuation = yield* Ref.get(activeContinuation)
                  const scheduledContinuation =
                    operation.kind !== "model"
                      ? undefined
                      : steeringEntryIds.length === 0
                        ? null
                        : completed?._tag === "TurnCompleted"
                          ? {
                              schemaVersion: 1 as const,
                              prompt: steeringPrompt!,
                              history: completed.transcript,
                              nextTurn: completed.turn + 1,
                              steeringEntryIds,
                            }
                          : currentContinuation
                  const record = yield* store.recordOperation({
                    ...claim,
                    operationKey: operation.key,
                    kind: operation.kind,
                    inputDigest: operation.inputDigest,
                    input: operation.input,
                    replayPolicy: operation.replayPolicy,
                    attempt: claimed.attempt,
                    checkpoint,
                    ...(completed?._tag === "TurnCompleted" ? { transcript: completed.transcript } : {}),
                    ...(scheduledContinuation === undefined ? {} : { continuation: scheduledContinuation }),
                    steeringEntryIds,
                    steeringEvents,
                  })
                  if (operation.kind === "model") {
                    yield* Ref.set(observed, [])
                    yield* Ref.set(observedPrompt, undefined)
                    yield* Ref.set(bufferedEvents, [])
                    yield* Ref.set(
                      activeContinuation,
                      scheduledContinuation === null ? undefined : scheduledContinuation,
                    )
                  }
                  if (
                    record.inputDigest !== operation.inputDigest ||
                    record.kind !== operation.kind ||
                    record.replayPolicy !== operation.replayPolicy
                  ) {
                    return yield* Effect.die(
                      new Error(`Persisted operation ${operation.key} does not match the scheduled operation`),
                    )
                  }
                  if (record.status === "succeeded") return { _tag: "Succeeded" as const, value: record.result }
                  if (record.status === "failed") return { _tag: "Failed" as const, error: record.error }
                  if (record.status === "unknown") return { _tag: "Unknown" as const, operationId: record.operationId }
                  const recovered =
                    record.status === "running"
                      ? yield* store.expireRunningOperation({ ...claim, operationId: record.operationId })
                      : undefined
                  if (recovered?.outcome === "unknown") {
                    return { _tag: "Unknown" as const, operationId: record.operationId }
                  }
                  yield* store.startOperation({ ...claim, operationId: record.operationId })
                  return undefined
                }).pipe(Effect.orDie),
              onCompleted: (operation, outcome, checkpoint) =>
                Effect.gen(function* () {
                  const persisted = yield* store.getOperationByKey({ runId, operationKey: operation.key })
                  if (persisted === undefined)
                    return yield* Effect.die(new Error(`Scheduled operation ${operation.key} is missing`))
                  const operationId = persisted.operationId
                  if (outcome._tag === "Succeeded") {
                    yield* store.succeedOperation({ ...claim, operationId, result: outcome.value })
                  } else if (outcome._tag === "Failed") {
                    yield* store.failOperation({ ...claim, operationId, error: outcome.error })
                  } else {
                    yield* store.markOperationUnknown({ ...claim, operationId })
                  }
                  yield* store.saveExecution({ ...claim, checkpoint })
                }).pipe(Effect.orDie),
              onCheckpoint: (checkpoint) => store.saveExecution({ ...claim, checkpoint }).pipe(Effect.orDie),
            }
            const journalLayer = Layer.succeed(DurableDriver.DriverJournalService, journal)
            const runOptions: Agent.RunOptions = {
              prompt,
              sessionId: claimed.message.sessionId,
              logicalOperationId: runId,
              sessionOwnerToken: `${claim.ownerId}:${claim.attemptFence}`,
              agentRef: claimed.agent,
              budget: registration.agent.budget ?? {
                modelCalls: 64,
                toolCalls: 256,
                totalTokens: 1_000_000,
                childRuns: 32,
                handoffs: 32,
                depth: 8,
              },
              ...(initialCheckpoint === undefined ? {} : { driverCheckpoint: initialCheckpoint }),
              ...(history === undefined ? {} : { history }),
              ...(continuation === undefined ? {} : { turnStart: continuation.nextTurn }),
              ...(claimed.suspension === undefined
                ? {}
                : {
                    resume: {
                      suspension: claimed.suspension,
                      ...(claimed.resolution === undefined
                        ? {}
                        : {
                            resolution: claimed.resolution,
                          }),
                    },
                  }),
            }
            let stream = Agent.stream(registration.agent, runOptions).pipe(
              Stream.provide(journalLayer),
              Stream.provide(steeringLayer),
            )
            if (registration.services !== undefined) {
              stream = stream.pipe(Stream.provide(registration.services)) as typeof stream
            }
            const execution = yield* stream.pipe(
              Stream.runForEach((event) =>
                event._tag === "Completed"
                  ? Effect.gen(function* () {
                      const result: AgentResult = { text: event.text, turns: event.turns, transcript: event.transcript }
                      const outcome = yield* store.complete({ ...claim, result })
                      if (outcome._tag === "SteeringPending") {
                        yield* Ref.set(pendingCompletion, outcome.continuation)
                      }
                    })
                  : Effect.gen(function* () {
                      if ((yield* Ref.get(observed)).length > 0) {
                        yield* Ref.update(bufferedEvents, (events) => [...events, event])
                        return
                      }
                      yield* store.emitAgentEvent({ ...claim, event })
                    }),
              ),
              Effect.forkChild({ startImmediately: false }),
            )
            yield* active.begin(runId, execution)
            const exit = yield* Fiber.await(execution).pipe(Effect.ensuring(active.end(runId)))
            if (exit._tag === "Success") {
              const next = yield* Ref.get(pendingCompletion)
              if (next === undefined) return
              const latest = yield* store.loadExecution(runId)
              return yield* runAgent(next.prompt, next.history, latest.checkpoint, next)
            }
            if (Cause.hasInterruptsOnly(exit.cause)) return
            const reason = exit.cause.reasons.length === 1 ? exit.cause.reasons[0] : undefined
            if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(RunTerminal)(reason.error)) return
            if (
              reason !== undefined &&
              Cause.isFailReason(reason) &&
              Schema.is(AgentEvent.AgentSuspended)(reason.error)
            ) {
              const suspension = reason.error
              yield* store.saveExecution({ ...claim, suspension })
              const openedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
              yield* store.wait({
                ...claim,
                wait: { waitId: suspension.tool_call_id, reason: suspension.reason, status: "open", openedAt },
              })
              return
            }
            yield* store
              .fail({ ...claim, error: { message: failureMessage(exit.cause) } })
              .pipe(Effect.catch((error) => (Schema.is(RunTerminal)(error) ? Effect.void : Effect.fail(error))))
          }).pipe(Effect.orDie) as Effect.Effect<void>

        const continuation = claimed.continuation
        yield* runAgent(
          continuation?.prompt ?? claimed.message.prompt,
          continuation?.history ?? claimed.transcript,
          claimed.checkpoint,
          continuation,
        )
      }).pipe(Effect.orDie) as Effect.Effect<void>

    return AgentHost.of({ execute })
  })

export const layer = (options: Options): Layer.Layer<AgentHost, never, RunStore | ActiveExecutions> =>
  Layer.effect(AgentHost, make(options))
