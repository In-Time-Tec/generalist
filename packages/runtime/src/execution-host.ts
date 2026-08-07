import { Cause, Context, DateTime, Effect, Layer, Option, Ref, Schema, type Scope, Stream } from "effect"
import { Prompt, type Tool } from "effect/unstable/ai"
import { Agent, AgentEvent, DurableDriver, Handoff, Steering } from "@batonfx/core"
import { RunStore, type ExecutionClaim } from "./run-store.js"
import { ActiveExecutions } from "./active-executions.js"
import {
  AgentExecutionFailure,
  compactionOptionsMismatch,
  ExecutableIdentityMismatch,
  RunTerminal,
  undecodableSuspension,
} from "./errors.js"
import {
  makeAttestation,
  makeInput,
  matchesActiveRunOptions,
  type Interface as ExecutableResolverInterface,
} from "./executable-resolver.js"
import { decodePinned, equals } from "./executable-manifest.js"
import type { ExecutionContinuation } from "./steering.js"
import type { AgentLoopEvent } from "./agent-event.js"
import { commitDeferredProgramChildTerminal, makeDeferredProgramChildTerminal } from "./program-child-terminal.js"
import { agentBudget } from "./execution-defaults.js"
import { make as makeCodeMode, withTool as withCodeModeTool } from "./code-mode.js"
import { hostContext, sessionContext } from "./execution-context.js"
import { settleInterruptedExecution } from "./execution-interruption.js"
import { executeProgram } from "./execute-program.js"
import { approvalReason } from "./run-wait.js"
export interface Options {
  readonly workerId: string
  readonly resolver: ExecutableResolverInterface
}
export interface Interface {
  readonly execute: (claim: ExecutionClaim) => Effect.Effect<void>
}
export class ExecutionHost extends Context.Service<ExecutionHost, Interface>()("@batonfx/runtime/ExecutionHost") {}
const failureMessage = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause)
  return error instanceof Error ? error.message : String(error)
}
export const make = (options: Options): Effect.Effect<Interface, never, RunStore | ActiveExecutions> =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const active = yield* ActiveExecutions
    const executeClaim = (claim: ExecutionClaim): Effect.Effect<void> =>
      Effect.gen(function* () {
        const claimed = yield* store.loadExecution(claim.runId)
        if (claimed.attemptFence !== claim.attemptFence) {
          yield* store.saveExecution(claim)
          return
        }
        const runId = claim.runId
        const activeOperationIds = yield* Ref.make<ReadonlySet<string>>(new Set())
        const completingRetrySafeOperationIds = yield* Ref.make<ReadonlySet<string>>(new Set())
        const deferredProgramChildTerminal = yield* makeDeferredProgramChildTerminal
        const isProgramChild = claimed.message.metadata?.programOperation !== undefined
        const settleInterruption = settleInterruptedExecution({
          store,
          claim,
          runId,
          activeOperationIds,
          completingRetrySafeOperationIds,
        })

        const scopedExecution = Effect.scoped(
          Effect.gen(function* () {
            const resolution = yield* options.resolver
              .resolve(
                makeInput({
                  runId,
                  ref: claimed.executableRef,
                  manifest: claimed.executableManifest,
                  registrations: claimed.registrations,
                }),
              )
              .pipe(Effect.catch((error) => store.fail({ ...claim, error }).pipe(Effect.as(undefined))))
            if (resolution === undefined) return
            const resolved = resolution
            let identityMatches = false
            try {
              identityMatches = equals(
                decodePinned({ ref: claimed.executableRef, manifest: claimed.executableManifest }),
                makeAttestation(resolved.attestation),
              )
            } catch {
              identityMatches = false
            }
            if (!identityMatches) {
              yield* store.fail({
                ...claim,
                error: ExecutableIdentityMismatch.make({
                  runId,
                  expectedRef: claimed.executableRef,
                  actualRef: resolved.attestation.ref,
                }),
              })
              return
            }

            if (resolved._tag === "Program") {
              yield* executeProgram({ claim, claimed, store, resolution: resolved })
              return
            }

            const activeEntry = claimed.executableManifest.entries.find(
              (entry) => entry._tag === "Agent" && entry.pin === claimed.executableRef.active,
            )
            const programAuthority = activeEntry?._tag === "Agent" ? activeEntry.manifest.programAuthority : undefined
            const codeMode =
              programAuthority === undefined
                ? undefined
                : makeCodeMode({ claim, claimed, authority: programAuthority, store })
            const runClosed = <Tools extends Record<string, Tool.Any>, R>(
              agent: Agent.Agent<Tools, R>,
              environment: Layer.Layer<Agent.ClosedServices<Tools, R>>,
            ): Effect.Effect<void, never, Scope.Scope> =>
              Effect.gen(function* () {
                // Session owns model-facing history, so a durable store hands each Run the conversation
                // for its session identity. Without one the Run stays process-bound.
                const baseContext = Context.merge(
                  yield* hostContext({ agent, environment, store, codeMode }),
                  yield* sessionContext(store, claimed.message.sessionId),
                )
                const runHosted = <HostedTools extends Record<string, Tool.Any>>(
                  hostedAgent: Agent.Agent<HostedTools, R>,
                ): Effect.Effect<void> => {
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
                      const steering = Steering.Steering.of({
                        steer: () => Effect.die(new Error("Runtime steering must be admitted through Runtime.steer")),
                        followUp: () =>
                          Effect.die(new Error("Runtime steering must be admitted through Runtime.steer")),
                        takeSteering: take,
                        takeFollowUp: take,
                      })
                      const pendingCompletion = yield* Ref.make<ExecutionContinuation | undefined>(undefined)
                      const preparedCompletions = yield* Ref.make(
                        new Map<
                          string,
                          {
                            readonly transcript?: Prompt.Prompt
                            readonly continuation?: ExecutionContinuation | null
                            readonly steeringEntryIds?: ReadonlyArray<string>
                          }
                        >(),
                      )
                      const journal: DurableDriver.DriverJournal = {
                        onScheduled: (operation, checkpoint) =>
                          Effect.gen(function* () {
                            const steeringEntryIds = operation.kind === "model" ? yield* Ref.get(observed) : []
                            const steeringPrompt =
                              operation.kind === "model" ? yield* Ref.get(observedPrompt) : undefined
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
                            yield* Ref.update(preparedCompletions, (current) => {
                              const next = new Map(current)
                              next.set(operation.key, {
                                ...(completed?._tag === "TurnCompleted" ? { transcript: completed.transcript } : {}),
                                ...(scheduledContinuation === undefined ? {} : { continuation: scheduledContinuation }),
                                ...(steeringEntryIds.length === 0 ? {} : { steeringEntryIds }),
                              })
                              return next
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
                                new Error(
                                  `Persisted operation ${operation.key} does not match the scheduled operation`,
                                ),
                              )
                            }
                            if (record.status === "succeeded")
                              return { _tag: "Succeeded" as const, value: record.result }
                            if (record.status === "failed") return { _tag: "Failed" as const, error: record.error }
                            if (record.status === "unknown")
                              return { _tag: "Unknown" as const, operationId: record.operationId }
                            const recovered =
                              record.status === "running"
                                ? yield* store.expireRunningOperation({ ...claim, operationId: record.operationId })
                                : undefined
                            if (recovered?.outcome === "unknown") {
                              return { _tag: "Unknown" as const, operationId: record.operationId }
                            }
                            yield* store.startOperation({ ...claim, operationId: record.operationId })
                            yield* Ref.update(activeOperationIds, (current) => new Set(current).add(record.operationId))
                            return undefined
                          }).pipe(Effect.orDie),
                        onCompleted: (operation, outcome, checkpoint) =>
                          Effect.gen(function* () {
                            const persisted = yield* store.getOperationByKey({ runId, operationKey: operation.key })
                            if (persisted === undefined)
                              return yield* Effect.die(new Error(`Scheduled operation ${operation.key} is missing`))
                            const operationId = persisted.operationId
                            if (operation.replayPolicy !== "never") {
                              yield* Ref.update(completingRetrySafeOperationIds, (current) =>
                                new Set(current).add(operationId),
                              )
                            }
                            const prepared = (yield* Ref.get(preparedCompletions)).get(operation.key)
                            if (prepared === undefined) {
                              return yield* Effect.die(
                                new Error(`Scheduled operation ${operation.key} has no prepared state`),
                              )
                            }
                            const handoffCommit =
                              outcome._tag === "Succeeded" && operation.kind === "handoff"
                                ? Schema.decodeUnknownOption(Handoff.HandoffCommit)(outcome.value)
                                : undefined
                            yield* store.completeOperation({
                              ...claim,
                              operationId,
                              outcome:
                                outcome._tag === "Succeeded"
                                  ? { _tag: "Succeeded", value: outcome.value }
                                  : outcome._tag === "Failed"
                                    ? { _tag: "Failed", error: outcome.error }
                                    : { _tag: "Unknown" },
                              checkpoint,
                              ...prepared,
                              ...(handoffCommit?._tag === "Some" ? { transcript: handoffCommit.value.transcript } : {}),
                            })
                            yield* Ref.update(preparedCompletions, (current) => {
                              const next = new Map(current)
                              next.delete(operation.key)
                              return next
                            })
                            yield* Ref.update(activeOperationIds, (current) => {
                              const next = new Set(current)
                              next.delete(operationId)
                              return next
                            })
                            yield* Ref.update(completingRetrySafeOperationIds, (current) => {
                              const next = new Set(current)
                              next.delete(operationId)
                              return next
                            })
                          }).pipe(Effect.orDie),
                        onCheckpoint: (checkpoint) => store.saveExecution({ ...claim, checkpoint }).pipe(Effect.orDie),
                      }
                      const context = Context.merge(
                        baseContext,
                        Context.merge(
                          Context.make(DurableDriver.DriverJournalService, journal),
                          Context.make(Steering.Steering, steering),
                        ),
                      )
                      if (
                        !matchesActiveRunOptions(claimed.executableRef, claimed.executableManifest, resolved.runOptions)
                      ) {
                        return yield* store.fail({ ...claim, error: compactionOptionsMismatch })
                      }
                      const persistedSuspension =
                        claimed.suspension === undefined
                          ? Option.none<AgentEvent.AgentSuspended>()
                          : Schema.decodeUnknownOption(AgentEvent.AgentSuspended)(claimed.suspension)
                      if (claimed.suspension !== undefined && Option.isNone(persistedSuspension)) {
                        return yield* store.fail({ ...claim, error: undecodableSuspension })
                      }
                      const resolvedCompaction = resolved.runOptions?.compaction
                      const runOptions = {
                        prompt,
                        sessionId: claimed.message.sessionId,
                        logicalOperationId: runId,
                        invocation: {
                          runId,
                          rootRunId: claimed.rootRunId,
                          attempt: claimed.attempt,
                          admittedAt: claimed.admittedAt,
                        },
                        sessionOwnerToken: `${claim.ownerId}:${claim.attemptFence}`,
                        executableRef: claimed.executableRef,
                        executableManifest: claimed.executableManifest,
                        budget: resolved.agent.budget ?? agentBudget,
                        ...(resolvedCompaction === undefined ? {} : { compaction: resolvedCompaction }),
                        ...(initialCheckpoint === undefined ? {} : { driverCheckpoint: initialCheckpoint }),
                        ...(history === undefined ? {} : { history }),
                        ...(continuation === undefined ? {} : { turnStart: continuation.nextTurn }),
                        ...(Option.isNone(persistedSuspension)
                          ? {}
                          : {
                              resume: {
                                suspension: persistedSuspension.value,
                                ...(claimed.resolution === undefined ? {} : { resolution: claimed.resolution }),
                              },
                            }),
                      } satisfies Agent.RunOptions
                      const exit = yield* Agent.stream(hostedAgent, runOptions).pipe(
                        Stream.runForEach((event) =>
                          event._tag === "Completed"
                            ? Effect.gen(function* () {
                                const result = {
                                  text: event.text,
                                  turns: event.turns,
                                  transcript: event.transcript,
                                }
                                if (isProgramChild) {
                                  yield* Ref.set(deferredProgramChildTerminal, { _tag: "Complete", result })
                                  return
                                }
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
                        Effect.provideContext(context),
                        Effect.exit,
                      )
                      if (exit._tag === "Success") {
                        const next = yield* Ref.get(pendingCompletion)
                        if (next === undefined) return
                        const latest = yield* store.loadExecution(runId)
                        const checkpoint =
                          latest.checkpoint !== undefined && "driverVersion" in latest.checkpoint
                            ? latest.checkpoint
                            : undefined
                        return yield* runAgent(next.prompt, next.history, checkpoint, next)
                      }
                      if (Cause.hasInterruptsOnly(exit.cause)) {
                        return yield* Effect.failCause(exit.cause)
                      }
                      const reason = exit.cause.reasons.length === 1 ? exit.cause.reasons[0] : undefined
                      if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(RunTerminal)(reason.error))
                        return
                      if (
                        reason !== undefined &&
                        Cause.isFailReason(reason) &&
                        Schema.is(AgentEvent.AgentSuspended)(reason.error)
                      ) {
                        const suspension = reason.error
                        const openedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
                        const latest = yield* store.loadExecution(runId)
                        if (codeMode !== undefined && suspension.tool_name === "code_mode") {
                          yield* codeMode.admitSuspension({
                            suspension,
                            openedAt,
                            ...(latest.checkpoint === undefined ? {} : { checkpoint: latest.checkpoint }),
                            ...(latest.transcript === undefined ? {} : { transcript: latest.transcript }),
                            ...(latest.continuation === undefined ? {} : { continuation: latest.continuation }),
                          })
                          return
                        }
                        yield* store.suspend({
                          ...claim,
                          suspension,
                          ...(latest.checkpoint === undefined ? {} : { checkpoint: latest.checkpoint }),
                          ...(latest.transcript === undefined ? {} : { transcript: latest.transcript }),
                          ...(latest.continuation === undefined ? {} : { continuation: latest.continuation }),
                          wait: {
                            waitId: suspension.reason === "approval" ? suspension.token : suspension.tool_call_id,
                            reason:
                              suspension.reason === "approval"
                                ? approvalReason({
                                    approvalId: suspension.token,
                                    operation: suspension.tool_call_id,
                                    capability: suspension.tool_name,
                                    input: suspension.tool_params,
                                  })
                                : { _tag: "ToolWait" },
                            status: "open",
                            openedAt,
                          },
                        })
                        return
                      }
                      if ((yield* store.inspect(runId)).status === "needs-resolution") return
                      const failure = AgentExecutionFailure.make({ message: failureMessage(exit.cause) })
                      if (isProgramChild) {
                        yield* Ref.set(deferredProgramChildTerminal, { _tag: "Fail", error: failure })
                        return
                      }
                      yield* store
                        .fail({ ...claim, error: failure })
                        .pipe(
                          Effect.catch((error) => (Schema.is(RunTerminal)(error) ? Effect.void : Effect.fail(error))),
                        )
                    }).pipe(Effect.orDie)

                  const continuation = claimed.continuation
                  const checkpoint =
                    claimed.checkpoint !== undefined && "driverVersion" in claimed.checkpoint
                      ? claimed.checkpoint
                      : undefined
                  return runAgent(
                    continuation?.prompt ?? claimed.message.prompt,
                    continuation?.history ?? claimed.transcript,
                    checkpoint,
                    continuation,
                  )
                }
                yield* codeMode === undefined ? runHosted(agent) : runHosted(withCodeModeTool(agent, codeMode))
              })

            yield* resolved.agent.open(runClosed)
          }),
        )
        const execution = scopedExecution.pipe(
          Effect.andThen(commitDeferredProgramChildTerminal(store, claim, deferredProgramChildTerminal)),
          Effect.onInterrupt(() =>
            active
              .cancellationRequested(runId)
              .pipe(Effect.flatMap((requested) => (requested ? settleInterruption : Effect.void))),
          ),
        )
        yield* execution
      }).pipe(Effect.orDie)

    const execute = (claim: ExecutionClaim): Effect.Effect<void> => active.run(claim.runId, executeClaim(claim))

    return ExecutionHost.of({ execute })
  })

export const layer = (options: Options): Layer.Layer<ExecutionHost, never, RunStore | ActiveExecutions> =>
  Layer.effect(ExecutionHost, make(options))
