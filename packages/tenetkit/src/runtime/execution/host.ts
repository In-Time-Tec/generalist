import { Cause, Context, DateTime, Effect, Layer, Option, Ref, type Scope, Stream } from "effect"
import { Prompt, type Tool } from "effect/unstable/ai"
import { Agent } from "../../core/index.js"
import { AgentEvent } from "../../core/agent/public/event.js"
import { DurableDriver } from "../../core/durable/public/driver.js"
import { Steering } from "../../core/turn/facade-steering.js"
import { RunStore, type ExecutionClaim } from "../run/store.js"
import { ActiveExecutions } from "./active-executions.js"
import { compactionOptionsMismatch, undecodableSuspension } from "../errors.js"
import { matchesActiveRunOptions, type Interface as ExecutableResolverInterface } from "../executable/resolver.js"
import type { ExecutionContinuation } from "../run/steering.js"
import { durableEvent, type DurableAgentLoopEvent } from "./agent/event.js"
import { ProgramChildTerminal, type DeferredProgramChildTerminal } from "../program/child-terminal.js"
import { make as makeCodeMode, withTool as withCodeModeTool } from "../code-mode.js"
import { hostContext, sessionBinding } from "./context.js"
import { make as makeNestedOperations } from "../operation/nested-operations.js"
import { make as makeExecutionInterruption } from "./interruption.js"
import { executeProgram } from "./execute-program.js"
import { approvalReason } from "../run/wait.js"
import { make as makeAgentExecutionFailure } from "./agent/failure.js"
import { make as makeExecutionRetry } from "./retry.js"
import { ExecutionResolution } from "./resolution.js"
import { make as makeToolCancellation } from "../operation/tool-cancellation.js"
import { make as makeAgentRunOptions } from "./agent/run-options.js"
import { ModelPreviewLane, open as openModelPreview } from "./model-response/preview.js"
import {
  clearDriverOperation,
  commitDriverOperationWithReconciliation,
  hydratePersistedModelOperation,
  journalFailure,
  saveJournalCheckpoint,
  verifyCommittedModelEvent,
} from "./model-response.js"
import { Tools as ChildRunTools } from "../child/group.js"
import {
  continuationForOperation,
  driverCheckpoint,
  runTerminalReason,
  suspendedReason,
  type PreparedCompletion,
  type RunOptionsInput,
} from "./completion/operations.js"
export interface Options {
  readonly workerId: string
  readonly resolver: ExecutableResolverInterface
}
export interface Interface {
  readonly execute: (claim: ExecutionClaim) => Effect.Effect<void>
  readonly interrupt: (runId: string) => Effect.Effect<void>
}
export class ExecutionHost extends Context.Service<ExecutionHost, Interface>()(
  "tenetkit/runtime/execution/host/ExecutionHost",
) {}
export const make = (options: Options): Effect.Effect<Interface, never, RunStore | ActiveExecutions> =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const active = yield* ActiveExecutions
    const previewLane = yield* Effect.serviceOption(ModelPreviewLane)
    const reconcileCancellation = yield* makeToolCancellation({ store, resolver: options.resolver })
    const executeClaim = (claim: ExecutionClaim, afterExit: Ref.Ref<Effect.Effect<void>>): Effect.Effect<void> =>
      Effect.gen(function* () {
        const claimed = yield* store.loadExecution(claim.runId)
        if (claimed.attemptFence !== claim.attemptFence) {
          yield* store.saveExecution(claim)
          return
        }
        if (claimed.cancellationRequested) {
          yield* reconcileCancellation(claim, claimed)
          return
        }
        if ((yield* store.recoverRunningOperations(claim)) === "blocked") return
        const runId = claim.runId
        const activeOperationIds = yield* Ref.make<ReadonlySet<string>>(new Set())
        const completingRetrySafeOperationIds = yield* Ref.make<ReadonlySet<string>>(new Set())
        const deferredProgramChildTerminal = yield* Ref.make<DeferredProgramChildTerminal | undefined>(undefined)
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
                ? ChildRunTools.make({ children: activeEntry.manifest.children })
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
                const boundSession = yield* sessionBinding({ store, sessionId: claimed.message.sessionId })
                const baseContext = Context.mergeAll(
                  yield* hostContext({ agent, environment, store, codeMode, nested }),
                  boundSession.context,
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
                            const [steeringEntryIds, steeringPrompt, steeringEvents] =
                              operation.kind === "model"
                                ? yield* Effect.all([
                                    Ref.get(observed),
                                    Ref.get(observedPrompt),
                                    Ref.get(bufferedEvents),
                                  ])
                                : [[], undefined, []]
                            const completed = steeringEvents.findLast((event) => event._tag === "TurnCompleted")
                            const currentContinuation = yield* Ref.get(activeContinuation)
                            const scheduledContinuation = continuationForOperation({
                              model: operation.kind === "model",
                              steeringEntryIds,
                              steeringPrompt,
                              completed,
                              current: currentContinuation,
                            })
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
                              ...Object.assign(
                                {},
                                scheduledContinuation === undefined
                                  ? undefined
                                  : { continuation: scheduledContinuation },
                              ),
                              steeringEntryIds,
                              steeringEvents,
                            })
                            yield* Ref.update(preparedCompletions, (current) => {
                              const next = new Map(current)
                              const prepared: PreparedCompletion = {}
                              if (scheduledContinuation !== undefined) prepared.continuation = scheduledContinuation
                              if (steeringEntryIds.length > 0) prepared.steeringEntryIds = steeringEntryIds
                              next.set(operation.key, prepared)
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
                          }).pipe(Effect.mapError((error) => journalFailure("schedule", operation.key, error))),
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
                            yield* commitDriverOperationWithReconciliation({
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
                          }).pipe(Effect.mapError((error) => journalFailure("completion", operation.key, error))),
                        onCheckpoint: (checkpoint) => saveJournalCheckpoint({ store, claim, checkpoint }),
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
                      const runOptionsInput: RunOptionsInput = {
                        claim,
                        execution: claimed,
                        attempt: yield* executionRetry.attempt,
                        prompt,
                        resume,
                        budget: resolved.agent.budget ?? {},
                      }
                      if (history !== undefined) runOptionsInput.history = history
                      if (initialCheckpoint !== undefined) runOptionsInput.checkpoint = initialCheckpoint
                      if (continuation !== undefined) runOptionsInput.continuation = continuation
                      if (turnStart !== undefined) runOptionsInput.turnStart = turnStart
                      if (resolved.runOptions?.compaction !== undefined) {
                        runOptionsInput.compaction = resolved.runOptions.compaction
                      }
                      const runOptions = makeAgentRunOptions(runOptionsInput)
                      if (runOptions === undefined) {
                        return yield* deferProgramChildFailure(undecodableSuspension)
                      }
                      const persistEvent = (event: AgentEvent.Event) =>
                        Effect.gen(function* () {
                          yield* executionRetry.observe(event)
                          if (event._tag === "ModelPart") return yield* preview.offer(event)
                          if (event._tag === "ModelResponseCommitted") {
                            yield* verifyCommittedModelEvent({ store, claim, event }).pipe(Effect.orDie)
                            return yield* preview.discard
                          }
                          if (event._tag === "Completed") {
                            const leafId = yield* Option.match(boundSession.session, {
                              onNone: () => Effect.succeed(null),
                              onSome: (service) => service.leaf.pipe(Effect.orDie),
                            })
                            const result = {
                              text: event.text,
                              turns: event.turns,
                              session: { sessionId: claimed.message.sessionId, leafId },
                            }
                            if (isProgramChild) {
                              return yield* Ref.set(deferredProgramChildTerminal, { _tag: "Complete", result })
                            }
                            const outcome = yield* store.complete({ ...claim, result })
                            if (outcome._tag === "SteeringPending") {
                              yield* Ref.set(pendingCompletion, outcome.continuation)
                            }
                            return
                          }
                          const persistedEvent = durableEvent(event)
                          if (
                            persistedEvent._tag === "ModelResponseCommitted" ||
                            persistedEvent._tag === "ModelResponseInterrupted"
                          ) {
                            return yield* Effect.die(new Error("Model response event reached the generic journal path"))
                          }
                          if ((yield* Ref.get(observed)).length > 0) {
                            return yield* Ref.update(bufferedEvents, (events) => [...events, persistedEvent])
                          }
                          yield* store.emitAgentEvent({ ...claim, event: persistedEvent })
                        })
                      const exit = yield* Agent.stream(hostedAgent, runOptions).pipe(
                        Stream.runForEach(persistEvent),
                        Effect.provideContext(context),
                        Effect.exit,
                      )
                      const suspendAgent = (suspension: AgentEvent.AgentSuspended) =>
                        Effect.gen(function* () {
                          const openedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
                          const latest = yield* store.loadExecution(runId)
                          const durableState = Object.assign(
                            {},
                            latest.checkpoint === undefined ? undefined : { checkpoint: latest.checkpoint },
                            latest.continuation === undefined ? undefined : { continuation: latest.continuation },
                          )
                          if (codeMode !== undefined && suspension.tool_name === "code_mode") {
                            return yield* codeMode.admitSuspension({ suspension, openedAt, ...durableState })
                          }
                          const nestedWait = yield* nested.waitFor(suspension)
                          const wait = nestedWait ?? {
                            waitId: suspension.reason === "approval" ? suspension.token : suspension.tool_call_id,
                            reason:
                              suspension.reason === "approval"
                                ? approvalReason({
                                    approvalId: suspension.token,
                                    operation: suspension.tool_call_id,
                                    capability: suspension.tool_name,
                                    input: suspension.tool_params,
                                  })
                                : { _tag: "ToolWait" as const },
                          }
                          yield* store.suspend({
                            ...claim,
                            suspension,
                            ...durableState,
                            wait: { ...wait, status: "open", openedAt },
                          })
                        })
                      const settleExit = Effect.gen(function* () {
                        yield* preview.clear
                        if (exit._tag === "Success") {
                          const next = yield* Ref.get(pendingCompletion)
                          if (next === undefined) return
                          const latest = yield* store.loadExecution(runId)
                          const checkpoint = driverCheckpoint(latest.checkpoint)
                          return yield* runAgent(next.prompt, undefined, checkpoint, next, undefined, false)
                        }
                        if (Cause.hasInterruptsOnly(exit.cause)) return yield* Effect.failCause(exit.cause)
                        const reason = exit.cause.reasons.length === 1 ? exit.cause.reasons[0] : undefined
                        if (runTerminalReason(reason)) return
                        const suspension = suspendedReason(reason)
                        if (suspension !== undefined) return yield* suspendAgent(suspension)
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
                      })
                      return yield* settleExit
                    }).pipe(Effect.orDie)
                  const continuation = claimed.continuation
                  const checkpoint = driverCheckpoint(claimed.checkpoint)
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
        const cancellationRequested = store.loadExecution(runId).pipe(
          Effect.map((run) => run.cancellationRequested),
          Effect.catchTag("tenetkit/runtime/RunNotFound", () => Effect.succeed(false)),
          Effect.orDie,
        )
        yield* scopedExecution.pipe(
          Effect.andThen(
            ProgramChildTerminal.commit(store, claim, deferredProgramChildTerminal, (error) =>
              interruption.settle({ reason: "failure", error }),
            ),
          ),
          Effect.onInterrupt(() => Ref.set(afterExit, interruption.onInterrupt(cancellationRequested))),
        )
      }).pipe(Effect.orDie)
    const execute = (claim: ExecutionClaim): Effect.Effect<void> =>
      Effect.gen(function* () {
        const afterExit = yield* Ref.make<Effect.Effect<void>>(Effect.void)
        const settleAndRelease = Ref.get(afterExit).pipe(
          Effect.flatten,
          Effect.ensuring(store.releaseExecution(claim).pipe(Effect.ignore)),
        )
        yield* active.run(claim.runId, executeClaim(claim, afterExit), settleAndRelease)
      })
    return ExecutionHost.of({ execute, interrupt: (runId) => active.interrupt(runId) })
  })
export const layer = (options: Options) => Layer.effect(ExecutionHost, make(options))
