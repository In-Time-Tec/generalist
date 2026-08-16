import { Cause, Context, DateTime, Effect, Layer, Option, Ref, Schema, type Scope, Stream } from "effect"
import { Prompt, type Tool } from "effect/unstable/ai"
import { Agent, AgentEvent, DurableDriver, Steering } from "@batonfx/core"
import { RunStore, type ExecutionClaim } from "./run-store.js"
import { ActiveExecutions } from "./active-executions.js"
import { compactionOptionsMismatch, RunTerminal, undecodableSuspension } from "./errors.js"
import { matchesActiveRunOptions, type Interface as ExecutableResolverInterface } from "./executable-resolver.js"
import type { ExecutionContinuation } from "./steering.js"
import { durableEvent, type DurableAgentLoopEvent, type EmittableAgentLoopEvent } from "./agent-event.js"
import { makeDeferredProgramChildTerminal, ProgramChildTerminal } from "./program-child-terminal.js"
import { agentBudget } from "./execution-defaults.js"
import { make as makeCodeMode, withTool as withCodeModeTool } from "./code-mode.js"
import { hostContext, sessionContext } from "./execution-context.js"
import { make as makeNestedOperations } from "./nested-operations.js"
import { makeExecutionInterruption } from "./execution-interruption.js"
import { executeProgram } from "./execute-program.js"
import { approvalReason } from "./run-wait.js"
import { makeAgentExecutionFailure } from "./agent-execution-failure.js"
import { make as makeExecutionRetry } from "./execution-retry.js"
import { ExecutionClaimLifecycle } from "./execution-claim-lifecycle.js"
import { ExecutionResolution } from "./execution-resolution.js"
import { make as makeAgentRunOptions } from "./agent-run-options.js"
import { ModelPreviewLane, open as openModelPreview } from "./model-preview.js"
import {
  clearDriverOperation,
  commitDriverOperation,
  hydratePersistedModelOperation,
  verifyCommittedModelEvent,
} from "./execution-model-response.js"
import { makeTools as makeChildRunTools } from "./child-runs.js"
export interface Options {
  readonly workerId: string
  readonly resolver: ExecutableResolverInterface
}
export interface Interface {
  readonly execute: (claim: ExecutionClaim) => Effect.Effect<void>
  readonly interrupt: (runId: string) => Effect.Effect<void>
}
export class ExecutionHost extends Context.Service<ExecutionHost, Interface>()(
  "@batonfx/runtime/execution-host/ExecutionHost",
) {}
export const make = (options: Options): Effect.Effect<Interface, never, RunStore | ActiveExecutions> =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const active = yield* ActiveExecutions
    const previewLane = yield* Effect.serviceOption(ModelPreviewLane)
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
        const isProgramChild = yield* ProgramChildTerminal.owns(store, claimed)
        const deferProgramChildFailure = ProgramChildTerminal.makeFailure(
          store,
          claim,
          deferredProgramChildTerminal,
          isProgramChild,
        )
        const interruption = makeExecutionInterruption({
          store,
          claim,
          runId,
          activeOperationIds,
          completingRetrySafeOperationIds,
        })
        const scopedExecution = Effect.scoped(
          Effect.gen(function* () {
            const resolved = yield* ExecutionResolution.resolve(options.resolver, claimed, deferProgramChildFailure)
            if (resolved === undefined) return
            if (resolved._tag === "Program") {
              yield* executeProgram({ claim, claimed, store, resolution: resolved })
              return
            }
            const activeEntry = claimed.executableManifest.entries.find(
              (entry) => entry._tag === "Agent" && entry.pin === claimed.executableRef.active,
            )
            const childRunTools =
              activeEntry?._tag === "Agent" &&
              activeEntry.manifest.children.length > 0 &&
              claimed.depth < claimed.treePolicy.maxDepth &&
              claimed.activeChildCount < claimed.treePolicy.maxSubagents
                ? makeChildRunTools({ children: activeEntry.manifest.children })
                : undefined
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
                const nested = yield* makeNestedOperations({ claim, claimed, store })
                const preview = yield* openModelPreview(previewLane)(runId, claim.attemptFence)
                const baseContext = Context.mergeAll(
                  yield* hostContext({ agent, environment, store, codeMode, nested }),
                  yield* sessionContext({ store, sessionId: claimed.message.sessionId }),
                  interruption.context,
                )
                const executionRetry = yield* makeExecutionRetry(claimed.attempt)
                const runHosted = (hostedAgent: Agent.Agent<Tools, R>): Effect.Effect<void> => {
                  const runAgent = (
                    prompt: Prompt.RawInput,
                    history: Prompt.Prompt | undefined,
                    initialCheckpoint: DurableDriver.DriverCheckpoint | undefined,
                    continuation?: ExecutionContinuation,
                    turnStart?: number,
                    resume = false,
                  ): Effect.Effect<void> =>
                    Effect.gen(function* () {
                      const observed = yield* Ref.make<ReadonlyArray<string>>(continuation?.steeringEntryIds ?? [])
                      const observedPrompt = yield* Ref.make<Prompt.Prompt | undefined>(continuation?.prompt)
                      const activeContinuation = yield* Ref.make(continuation)
                      const bufferedEvents = yield* Ref.make<ReadonlyArray<DurableAgentLoopEvent>>(
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
                        yield* store.deliverPendingMessages({ runId })
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
                                        nextTurn: completed.turn + 1,
                                        steeringEntryIds,
                                      }
                                    : currentContinuation
                            const attempt = yield* executionRetry.attempt
                            const record = yield* store.recordOperation({
                              ...claim,
                              operationKey: operation.key,
                              kind: operation.kind,
                              inputDigest: operation.inputDigest,
                              input: operation.input,
                              replayPolicy: operation.replayPolicy,
                              attempt,
                              checkpoint,
                              ...(scheduledContinuation === undefined ? {} : { continuation: scheduledContinuation }),
                              steeringEntryIds,
                              steeringEvents,
                            })
                            yield* Ref.update(preparedCompletions, (current) => {
                              const next = new Map(current)
                              next.set(operation.key, {
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
                            if (record.status === "succeeded") {
                              const value =
                                operation.kind === "model"
                                  ? yield* hydratePersistedModelOperation({ store, value: record.result })
                                  : record.result
                              return { _tag: "Succeeded" as const, value }
                            }
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
                            if (operation.kind === "model" && outcome._tag !== "Succeeded") return
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
                            yield* commitDriverOperation({
                              store,
                              claim,
                              operation,
                              operationId,
                              outcome,
                              checkpoint,
                              prepared,
                            })
                            yield* clearDriverOperation({
                              prepared: preparedCompletions,
                              active: activeOperationIds,
                              completingRetrySafe: completingRetrySafeOperationIds,
                              operationKey: operation.key,
                              operationId,
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
                        return yield* deferProgramChildFailure(compactionOptionsMismatch)
                      }
                      const runOptions = makeAgentRunOptions({
                        claim,
                        execution: claimed,
                        attempt: yield* executionRetry.attempt,
                        prompt,
                        ...(history === undefined ? {} : { history }),
                        ...(initialCheckpoint === undefined ? {} : { checkpoint: initialCheckpoint }),
                        ...(continuation === undefined ? {} : { continuation }),
                        ...(turnStart === undefined ? {} : { turnStart }),
                        resume,
                        budget: resolved.agent.budget ?? agentBudget,
                        ...(resolved.runOptions?.compaction === undefined
                          ? {}
                          : { compaction: resolved.runOptions.compaction }),
                      })
                      if (runOptions === undefined) {
                        return yield* deferProgramChildFailure(undecodableSuspension)
                      }
                      const exit = yield* Agent.stream(hostedAgent, runOptions).pipe(
                        Stream.runForEach((event) =>
                          Effect.gen(function* () {
                            yield* executionRetry.observe(event)
                            if (event._tag === "ModelPart") {
                              yield* preview.offer(event)
                              return
                            }
                            if (event._tag === "ModelResponseCommitted") {
                              yield* verifyCommittedModelEvent({ store, claim, event }).pipe(Effect.orDie)
                              yield* preview.discard
                              return
                            }
                            if (event._tag === "Completed") {
                              const session = yield* store.sessionStore(claimed.message.sessionId)
                              const leafId = yield* Option.match(session, {
                                onNone: () => Effect.succeed(null),
                                onSome: (service) => service.leaf.pipe(Effect.orDie),
                              })
                              const result = {
                                text: event.text,
                                turns: event.turns,
                                session: { sessionId: claimed.message.sessionId, leafId },
                              }
                              if (isProgramChild) {
                                yield* Ref.set(deferredProgramChildTerminal, { _tag: "Complete", result })
                                return
                              }
                              const outcome = yield* store.complete({ ...claim, result })
                              if (outcome._tag === "SteeringPending") {
                                yield* Ref.set(pendingCompletion, outcome.continuation)
                              }
                              return
                            }
                            const persistedEvent = durableEvent(event) as EmittableAgentLoopEvent
                            if ((yield* Ref.get(observed)).length > 0) {
                              yield* Ref.update(bufferedEvents, (events) => [...events, persistedEvent])
                              return
                            }
                            yield* store.emitAgentEvent({ ...claim, event: persistedEvent })
                          }),
                        ),
                        Effect.provideContext(context),
                        Effect.exit,
                      )
                      yield* preview.clear
                      if (exit._tag === "Success") {
                        const next = yield* Ref.get(pendingCompletion)
                        if (next === undefined) return
                        const latest = yield* store.loadExecution(runId)
                        const checkpoint =
                          latest.checkpoint !== undefined && "driverVersion" in latest.checkpoint
                            ? latest.checkpoint
                            : undefined
                        return yield* runAgent(next.prompt, undefined, checkpoint, next, undefined, false)
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
                            ...(latest.continuation === undefined ? {} : { continuation: latest.continuation }),
                          })
                          return
                        }
                        const nestedWait = yield* nested.waitFor(suspension)
                        yield* store.suspend({
                          ...claim,
                          suspension,
                          ...(latest.checkpoint === undefined ? {} : { checkpoint: latest.checkpoint }),
                          ...(latest.continuation === undefined ? {} : { continuation: latest.continuation }),
                          wait: {
                            ...(nestedWait ?? {
                              waitId: suspension.reason === "approval" ? suspension.token : suspension.tool_call_id,
                              reason:
                                suspension.reason === "approval"
                                  ? approvalReason({
                                      approvalId: suspension.token,
                                      operation: suspension.tool_call_id,
                                      capability: suspension.tool_name,
                                      input: suspension.tool_params,
                                    })
                                  : ({ _tag: "ToolWait" } as const),
                            }),
                            status: "open",
                            openedAt,
                          },
                        })
                        return
                      }
                      if ((yield* store.inspect(runId)).status === "needs-resolution") return
                      const retry = yield* interruption.retry(isProgramChild, executionRetry.retry(store, claim))
                      if (retry !== undefined) {
                        return yield* runAgent(
                          retry.continuation?.prompt ?? Prompt.empty,
                          undefined,
                          retry.checkpoint,
                          retry.continuation,
                          retry.turn,
                          false,
                        )
                      }
                      const failure = makeAgentExecutionFailure(exit.cause)
                      if (isProgramChild) {
                        yield* Ref.set(deferredProgramChildTerminal, { _tag: "Fail", error: failure })
                        return
                      }
                      yield* interruption.settle({ reason: "failure", error: failure })
                    }).pipe(Effect.orDie)
                  const continuation = claimed.continuation
                  const checkpoint =
                    claimed.checkpoint !== undefined && "driverVersion" in claimed.checkpoint
                      ? claimed.checkpoint
                      : undefined
                  return runAgent(
                    continuation?.prompt ?? claimed.message.prompt,
                    undefined,
                    checkpoint,
                    continuation,
                    undefined,
                    claimed.suspension !== undefined,
                  )
                }
                const withChildren =
                  childRunTools === undefined
                    ? agent
                    : Agent.withTools(agent, [childRunTools.runChild, childRunTools.runChildGroup])
                yield* runHosted(codeMode === undefined ? withChildren : withCodeModeTool(withChildren, codeMode))
              })

            yield* resolved.agent.open(runClosed)
          }),
        )
        const execution = scopedExecution.pipe(
          Effect.andThen(
            ProgramChildTerminal.commit(store, claim, deferredProgramChildTerminal, (error) =>
              interruption.settle({ reason: "failure", error }),
            ),
          ),
          Effect.onInterrupt(() =>
            active
              .cancellationRequested(runId)
              .pipe(
                Effect.flatMap((requested) =>
                  requested ? interruption.settle({ reason: "cancel" }) : interruption.abandon,
                ),
              ),
          ),
        )
        yield* execution
      }).pipe(Effect.orDie)
    const execute = (claim: ExecutionClaim): Effect.Effect<void> =>
      active.run(claim.runId, ExecutionClaimLifecycle.releaseAfter(store, claim, executeClaim(claim)))
    return ExecutionHost.of({ execute, interrupt: (runId) => active.interrupt(runId) })
  })
export const layer = (options: Options): Layer.Layer<ExecutionHost, never, RunStore | ActiveExecutions> =>
  Layer.effect(ExecutionHost, make(options))
