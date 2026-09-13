/* eslint-disable max-lines -- durable execution remains one scoped ownership path */
import { Cause, Context, Effect, Layer, Option, Ref, Schema, type Scope, Stream } from "effect"
import { Prompt, type Tool } from "effect/unstable/ai"
import { type Agent, type ClosedServices, withTools } from "../../core/agent/service.js"
import { AgentError, type Event } from "../../core/agent/event.js"
import { HostedRun } from "../../core/agent/lifecycle/run-handle.js"
import { applyInheritance, Inheritance } from "../../core/agent/lifecycle/fan-out.js"
import { trustJournaled } from "../../core/capability/internal.js"
import { SessionState } from "../../core/durable/component/services.js"
import { type DriverCheckpoint, DriverJournal, type DriverOperation, type Journal } from "../../core/durable/driver.js"
import { externalRunInbox } from "../../core/turn/steering-inbox.js"
import { RunStore, type ExecutionClaim, type Service as RunStoreService } from "../run/store.js"
import { ActiveExecutions } from "./active-executions.js"
import { compactionOptionsMismatch, undecodableSuspension } from "../run/errors-internal.js"
import { ExecutableResolver, matchesActiveRunOptions } from "../executable/resolver.js"
import {
  executionBinding,
  make as makeRegisteredAgents,
  registeredProgramResolution,
  registeredResolution,
  type RegisteredAgents,
} from "../executable/registered-agent.js"
import type { ExecutionContinuation } from "../run/steering.js"
import { durableEvent, type DurableAgentLoopEvent } from "./agent/event.js"
import { ProgramChildTerminal, type DeferredProgramChildTerminal } from "../program/child-terminal.js"
import { make as makeCodeMode, withTool as withCodeModeTool } from "../code-mode/internal.js"
import { hostContext, sessionBinding } from "./context.js"
import { make as makeOperations } from "../operation/nested-operations.js"
import { JournalFault } from "../operation/journal-fault.js"
import { make as makeExecutionInterruption } from "./interruption.js"
import { executeProgram } from "./execute-program.js"
import { executeTool } from "./tool/execute.js"
import { toRunFailure } from "./agent/failure.js"
import { make as makeExecutionRetry } from "./recovery/retry.js"
import { ExecutionResolution } from "./resolution/resolve.js"
import { make as makeToolCancellation } from "../operation/tool-cancellation.js"
import { make as makeAgentRunOptions } from "./agent/run-options.js"
import { latestSandboxSnapshotId } from "./agent/sandbox-snapshot.js"
import { ModelPreviewLane, open as openModelPreview } from "./model-response/preview-internal.js"
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
import { suspend as suspendAgent } from "./agent/suspend.js"
import { make as makeRegisteredResolution } from "./agent/registered-resolution.js"
import type { Service } from "./run-executor.js"
import { requireRunAvailable } from "../budget/state.js"
import { prepare as prepareBudget } from "../budget/suspend.js"
import { Runtime } from "../engine.js"
import { make as makeMessaging, Policy as MessagingPolicy } from "../messaging/service.js"
import { RuntimeUnavailable } from "../errors.js"
import { withInherited as withInheritedTasks } from "../../tasks/internal.js"
import { Items as TaskItems } from "../../tasks/item.js"
import { Descriptor as CapabilityDescriptor } from "../../core/capability/state.js"
import { BackgroundTools } from "../../core/tools/background/index.js"
import { FrameworkFailure } from "../../core/tools/tool-executor.js"
import { issue as issueExecutionScope } from "./scope.js"

const requireOperationBudget = (kind: DriverOperation["kind"], runId: string, store: RunStoreService) =>
  kind === "memory" ? Effect.void : requireRunAvailable(runId)(store)

const commandIdentity = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.Json)))

type SteeringQueue = NonNullable<ExecutionContinuation["queue"]>

const continuationQueue = (continuation: ExecutionContinuation | undefined): SteeringQueue | undefined =>
  continuation === undefined ? undefined : (continuation.queue ?? "steering")

const makeFor = (
  agents: RegisteredAgents,
): Effect.Effect<Service, never, RunStore | ActiveExecutions | ExecutableResolver> =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const active = yield* ActiveExecutions
    const resolver = yield* ExecutableResolver
    const runtime = yield* Effect.serviceOption(Runtime)
    const messaging = makeMessaging({
      store,
      policy: MessagingPolicy.make(),
      sendMessage: (request) =>
        Option.isSome(runtime)
          ? runtime.value.sendMessage(request)
          : Effect.fail(RuntimeUnavailable.make({ message: "RunExecutor requires Runtime for in-agent messaging" })),
    })
    const registered = makeRegisteredResolution({ agents, resolver, store })
    const journalFault = yield* Effect.serviceOption(JournalFault)
    const previewLane = yield* Effect.serviceOption(ModelPreviewLane)
    const reconcileCancellation = yield* makeToolCancellation({
      store,
      resolver: registered.resolver,
      suspendUnknown: registered.suspendUnknown,
    })
    const executeClaim = (claim: ExecutionClaim, afterExit: Ref.Ref<Effect.Effect<void>>): Effect.Effect<void> =>
      Effect.gen(function* () {
        const claimed = yield* store.loadExecution(claim.runId)
        if (claimed.attemptFence !== claim.attemptFence) {
          yield* store.saveExecution({
            ...claim,
            commandId: commandIdentity(["verify-claim", claim.runId, claim.attemptFence]),
          })
          return
        }
        if (claimed.cancellationRequested) {
          yield* reconcileCancellation(claim, claimed)
          return
        }
        if (
          (yield* store.recoverRunningOperations({
            ...claim,
            commandId: commandIdentity(["recover-operations", claim.runId, claim.attemptFence]),
          })) === "blocked"
        )
          return
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
          // oxlint-disable-next-line eslint/complexity -- One claimed attempt exhaustively dispatches Tool, Program, or Agent execution while keeping scope issuance within the claim lifetime.
          Effect.gen(function* () {
            const resolved = yield* ExecutionResolution.resolve(
              registered.resolver,
              claimed,
              deferProgramChildFailure,
              (error) => registered.suspendUnknown(claim, error),
            )
            if (resolved === undefined) return
            if (resolved._tag === "Tool") {
              const nested = yield* makeOperations({ claim, claimed, store, activeOperationIds })
              yield* executeTool({ claim, claimed, store, resolution: resolved, activeOperationIds, nested })
              return
            }
            if (resolved._tag === "Program") {
              const programBinding = registeredProgramResolution(resolved)
              if (Option.isNone(programBinding)) {
                yield* executeProgram({ claim, claimed, store, resolution: resolved })
                return
              }
              const registration = programBinding.value.registration
              if (registration.partition === undefined) {
                return yield* Effect.die("Registered CodeMode Program has no Runtime partition identity")
              }
              const issued = yield* issueExecutionScope({
                binding: {
                  agents: programBinding.value.agents,
                  registration,
                  base: registration.context,
                  partition: registration.partition,
                },
                claim,
                claimed,
                store,
                runtime: Option.getOrUndefined(runtime),
                cancelChild: ({ claim: cancellationClaim, childRunId, commandId, reason }) =>
                  store
                    .cancelScopedChild(
                      reason === undefined
                        ? { ...cancellationClaim, childRunId, commandId }
                        : { ...cancellationClaim, childRunId, commandId, reason },
                    )
                    .pipe(Effect.tap(() => active.interrupt(childRunId))),
              })
              yield* executeProgram({
                claim,
                claimed,
                store,
                resolution: resolved,
                children: issued.scope.children,
              })
              return
            }
            const registeredAgent = registeredResolution(resolved.agent)
            const scopedBinding = executionBinding(resolved.agent)
            const issuedScope = Option.isSome(scopedBinding)
              ? yield* issueExecutionScope({
                  binding: scopedBinding.value,
                  claim,
                  claimed,
                  store,
                  runtime: Option.getOrUndefined(runtime),
                  cancelChild: ({ claim: cancellationClaim, childRunId, commandId, reason }) =>
                    store
                      .cancelScopedChild(
                        reason === undefined
                          ? { ...cancellationClaim, childRunId, commandId }
                          : { ...cancellationClaim, childRunId, commandId, reason },
                      )
                      .pipe(Effect.tap(() => active.interrupt(childRunId))),
                })
              : undefined
            const revisionAgents = Option.isSome(registeredAgent) ? registeredAgent.value.agents : agents
            const activeEntry = claimed.executableManifest.entries.find(
              (entry) => entry._tag === "Agent" && entry.pin === claimed.executableRef.active,
            )
            const childRunTools =
              activeEntry?._tag === "Agent" &&
              activeEntry.manifest.children.length > 0 &&
              claimed.depth < claimed.treePolicy.maxDepth &&
              claimed.treePolicy.concurrency.agents > 0
                ? ChildRunTools.make({ children: activeEntry.manifest.children })
                : undefined
            const programAuthority = activeEntry?._tag === "Agent" ? activeEntry.manifest.programAuthority : undefined
            const codeMode =
              programAuthority === undefined
                ? undefined
                : makeCodeMode({ claim, claimed, authority: programAuthority, store })
            const runClosed = <
              Tools extends Record<string, Tool.Any>,
              R,
              InputSchema extends Schema.Top,
              OutputSchema extends Schema.Top,
            >(
              agent: Agent<Tools, R, R, R, InputSchema, OutputSchema>,
              environment: Layer.Layer<ClosedServices<Tools, R, InputSchema, OutputSchema>>,
            ): Effect.Effect<void, never, Scope.Scope> =>
              Effect.gen(function* () {
                const snapshotId = latestSandboxSnapshotId(
                  yield* store.history({ runId, cursor: -1, limit: Number.MAX_SAFE_INTEGER }).pipe(Effect.orDie),
                )
                const inheritedSandboxSnapshot =
                  snapshotId === undefined ? undefined : yield* Ref.make<string | undefined>(snapshotId)
                const nested = yield* makeOperations({ claim, claimed, store, activeOperationIds })
                const budgetContext = { runId, claim, store, nested, codeMode }
                const preview = yield* openModelPreview(previewLane)(runId, claim.attemptFence)
                const boundSession = yield* sessionBinding({ store, claim }).pipe(Effect.orDie)
                const baseContext = Context.mergeAll(
                  yield* hostContext({ agent, environment, store, codeMode, nested, messaging }),
                  boundSession.context,
                  interruption.context,
                  Option.isSome(runtime)
                    ? Context.make(BackgroundTools, {
                        admit: (tool, input, commandId) =>
                          runtime.value.startTool(tool, input, { parentRunId: runId, commandId }).pipe(
                            Effect.map((handle) => ({
                              _tag: "ToolRunAdmitted" as const,
                              runId: handle.runId,
                              tool: String(tool.name),
                            })),
                            Effect.mapError((error) =>
                              FrameworkFailure.make({
                                stage: "handler",
                                tool: String(tool.name),
                                message: String(error),
                              }),
                            ),
                          ),
                      })
                    : Context.empty(),
                )
                const executionRetry = yield* makeExecutionRetry(claimed.attempt)
                const runHosted = (
                  hostedAgent: Agent<Tools, R, R, R, InputSchema, OutputSchema>,
                ): Effect.Effect<void> => {
                  const runAgent = (
                    prompt: Prompt.RawInput,
                    history: Prompt.Prompt | undefined,
                    initialCheckpoint: DriverCheckpoint | undefined,
                    continuation?: ExecutionContinuation,
                    turnStart?: number,
                    resume = false,
                  ): Effect.Effect<void> =>
                    Effect.gen(function* () {
                      const budget = yield* prepareBudget({ ...budgetContext, checkpoint: initialCheckpoint })
                      const executionAttempt = yield* executionRetry.attempt
                      const {
                        nextTurn = null,
                        steeringEntryIds: continuedEntryIds = [],
                        prompt: continuedPrompt,
                      } = continuation ?? {}
                      // Every new activation has a fresh fence; in-claim segments advance through
                      // a persisted retry attempt or an admitted steering continuation.
                      const segment = commandIdentity([
                        runId,
                        claim.attemptFence,
                        executionAttempt,
                        nextTurn,
                        continuedEntryIds,
                      ])
                      let checkpointOrdinal = 0
                      let eventOrdinal = 0
                      if (budget === undefined) return
                      const observed = yield* Ref.make<ReadonlyArray<string>>(continuedEntryIds)
                      const observedPrompt = yield* Ref.make<Prompt.Prompt | undefined>(continuedPrompt)
                      const observedQueue = yield* Ref.make(continuationQueue(continuation))
                      const activeContinuation = yield* Ref.make(continuation)
                      const bufferedEvents = yield* Ref.make<ReadonlyArray<DurableAgentLoopEvent>>(
                        continuation === undefined
                          ? []
                          : [
                              {
                                _tag: "SteeringDrained",
                                turn: Math.max(0, continuation.nextTurn - 1),
                                queue: continuation.queue ?? "steering",
                                count: continuation.steeringEntryIds.length,
                              },
                            ],
                      )
                      const takeSteering = Effect.gen(function* () {
                        const current = yield* Ref.get(observed)
                        if (current.length > 0) return []
                        const entries = yield* store.readSteering(claim)
                        if (entries.length === 0) return []
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
                        yield* Ref.set(observedQueue, "steering")
                        return entries.map((entry) => ({ prompt: entry.prompt }))
                      }).pipe(Effect.orDie)
                      const inbox = externalRunInbox({
                        runId,
                        takeSteering,
                        takeFollowUp: Effect.succeed([]),
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
                      const journal: Journal = {
                        onScheduled: (operation, checkpoint) =>
                          Effect.gen(function* () {
                            yield* requireOperationBudget(operation.kind, runId, store)
                            const [steeringEntryIds, steeringPrompt, steeringQueue, steeringEvents] =
                              operation.kind === "model"
                                ? yield* Effect.all([
                                    Ref.get(observed),
                                    Ref.get(observedPrompt),
                                    Ref.get(observedQueue),
                                    Ref.get(bufferedEvents),
                                  ])
                                : [[], undefined, undefined, []]
                            const completed = steeringEvents.findLast((event) => event._tag === "TurnCompleted")
                            const currentContinuation = yield* Ref.get(activeContinuation)
                            const scheduledContinuation = continuationForOperation({
                              model: operation.kind === "model",
                              steeringEntryIds,
                              steeringPrompt,
                              queue: steeringQueue,
                              completed,
                              current: currentContinuation,
                            })
                            const attempt = yield* executionRetry.attempt
                            const receipt = yield* store.recordOperation({
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
                            const record = yield* store.getOperation({ runId, operationId: receipt.operationId })
                            yield* Option.match(journalFault, {
                              onNone: () => Effect.void,
                              onSome: (fault) => fault.afterJournaledOperation,
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
                              yield* Ref.set(observedQueue, undefined)
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
                                ? yield* store.expireRunningOperation({
                                    ...claim,
                                    operationId: record.operationId,
                                    commandId: commandIdentity([
                                      "expire-operation",
                                      claim.runId,
                                      claim.attemptFence,
                                      record.operationId,
                                      attempt,
                                    ]),
                                  })
                                : undefined
                            if (recovered?.outcome === "unknown") {
                              return { _tag: "Unknown" as const, operationId: record.operationId }
                            }
                            yield* store.startOperation({
                              ...claim,
                              operationId: record.operationId,
                              commandId: commandIdentity([
                                "start-operation",
                                claim.runId,
                                claim.attemptFence,
                                record.operationId,
                                attempt,
                              ]),
                            })
                            yield* Ref.update(activeOperationIds, (current) => new Set(current).add(record.operationId))
                            return undefined
                          }).pipe(Effect.mapError((error) => journalFailure("schedule", operation.key, error))),
                        onAdmissionExhausted: (operation) =>
                          Effect.gen(function* () {
                            const record = yield* store.getOperationByKey({ runId, operationKey: operation.key })
                            if (record === undefined || record.status !== "running") return
                            yield* store.expireRunningOperation({
                              ...claim,
                              operationId: record.operationId,
                              commandId: commandIdentity([
                                "requeue-exhausted-operation",
                                claim.runId,
                                claim.attemptFence,
                                record.operationId,
                              ]),
                              reason: "child-admission-rejected",
                            })
                          }).pipe(Effect.mapError((error) => journalFailure("exhaustion", operation.key, error))),
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
                            yield* Option.match(journalFault, {
                              onNone: () => Effect.void,
                              onSome: (fault) => fault.afterCompletedOperation ?? Effect.void,
                            })
                          }).pipe(Effect.mapError((error) => journalFailure("completion", operation.key, error))),
                        onCheckpoint: (
                          checkpoint,
                          commandId = commandIdentity(["checkpoint", segment, checkpointOrdinal++]),
                        ) =>
                          saveJournalCheckpoint({
                            store,
                            claim,
                            checkpoint,
                            commandId,
                          }),
                      }
                      const sessionState = yield* store.loadExecution(runId).pipe(
                        Effect.map((execution) => ({
                          sessionId: execution.message.sessionId,
                          components: execution.sessionComponents ?? [],
                        })),
                      )
                      const context = Context.merge(baseContext, Context.make(DriverJournal, journal)).pipe(
                        Context.add(SessionState, sessionState),
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
                        budget: budget.remaining,
                        inheritedSandboxSnapshot,
                      }
                      if (history !== undefined) runOptionsInput.history = history
                      if (budget.checkpoint !== undefined) runOptionsInput.checkpoint = budget.checkpoint
                      if (continuation !== undefined) runOptionsInput.continuation = continuation
                      if (turnStart !== undefined) runOptionsInput.turnStart = turnStart
                      if (resolved.runOptions?.compaction !== undefined) {
                        runOptionsInput.compaction = resolved.runOptions.compaction
                      }
                      const runOptions = makeAgentRunOptions(runOptionsInput)
                      if (runOptions === undefined) {
                        return yield* deferProgramChildFailure(undecodableSuspension)
                      }
                      const persistEvent = (event: Event) => {
                        const commandId = commandIdentity(["agent-event", segment, eventOrdinal++])
                        return Effect.gen(function* () {
                          yield* executionRetry.observe(event)
                          if (event._tag === "ModelPart") return yield* preview.offer(event)
                          if (event._tag === "ModelResponseCommitted") {
                            yield* verifyCommittedModelEvent({ store, claim, event }).pipe(Effect.orDie)
                            return yield* preview.discard
                          }
                          if (event._tag === "Completed") {
                            const output = yield* Schema.encodeEffect(hostedAgent.output)(event.output).pipe(
                              Effect.mapError((error) =>
                                AgentError.make({
                                  message: `Agent output cannot be persisted: ${error.message}`,
                                  turn: Math.max(0, event.turns - 1),
                                  cause: error,
                                }),
                              ),
                            )
                            const leafId = yield* Option.match(boundSession.session, {
                              onNone: () => Effect.succeed(null),
                              onSome: (service) =>
                                service.leaf.pipe(
                                  Effect.mapError((cause) =>
                                    AgentError.make({
                                      message: "Cannot read the committed Session leaf",
                                      turn: Math.max(0, event.turns - 1),
                                      cause,
                                    }),
                                  ),
                                ),
                            })
                            const result = {
                              text: event.text,
                              output,
                              turns: event.turns,
                              session: { sessionId: claimed.message.sessionId, leafId },
                            }
                            if (isProgramChild) {
                              return yield* Ref.set(deferredProgramChildTerminal, { _tag: "Complete", result })
                            }
                            const outcome = yield* store.complete({ ...claim, commandId, result })
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
                          yield* store.emitAgentEvent({ ...claim, commandId, event: persistedEvent })
                        })
                      }
                      const exit = yield* HostedRun.stream(hostedAgent, runOptions, inbox).pipe(
                        Stream.runForEach(persistEvent),
                        Effect.provideContext(context),
                        Effect.exit,
                      )
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
                        if (suspension !== undefined) {
                          return yield* suspendAgent({
                            runId,
                            claim,
                            store,
                            nested,
                            ...(codeMode === undefined ? undefined : { codeMode }),
                            suspension,
                          })
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
                        const failure = toRunFailure(exit.cause)
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
                    : withTools(agent, [
                        childRunTools.awaitChildGroup,
                        ...(claimed.activeChildCount < claimed.treePolicy.concurrency.agents
                          ? [childRunTools.runChild, childRunTools.runChildGroup, childRunTools.startChildGroup]
                          : []),
                      ])
                yield* runHosted(codeMode === undefined ? withChildren : withCodeModeTool(withChildren, codeMode))
              })

            yield* resolved.agent.open((agent, environment) =>
              Effect.gen(function* () {
                // SAFETY: Runtime.layer statically proves base plus execution-service coverage,
                // and issueExecutionScope has built and merged that exact revision factory once.
                // The resolver erases the Agent's invariant service parameters before this point.
                const completeEnvironment =
                  issuedScope === undefined ? environment : (issuedScope.environment as typeof environment)
                const policy = Schema.decodeUnknownOption(Inheritance)(claimed.message.metadata.childInheritancePolicy)
                const parentName = Schema.decodeUnknownOption(Schema.String)(claimed.message.metadata.parentAgentName)
                if (Option.isNone(policy) || Option.isNone(parentName))
                  return yield* runClosed(agent, completeEnvironment)
                const parent = yield* revisionAgents.get(parentName.value)
                if (Option.isNone(parent)) return yield* runClosed(agent, completeEnvironment)
                const inheritedPolicy = Schema.is(Schema.Array(CapabilityDescriptor))(policy.value.tools)
                  ? { ...policy.value, tools: trustJournaled(policy.value.tools) }
                  : policy.value
                const inherited = yield* applyInheritance(parent.value.source, agent, inheritedPolicy)
                const tasks = Schema.decodeUnknownOption(TaskItems)(claimed.message.metadata.parentTasks)
                const child =
                  policy.value.tasks === "read" && Option.isSome(tasks)
                    ? withInheritedTasks(inherited, tasks.value)
                    : inherited
                return yield* runClosed(child, completeEnvironment)
              }).pipe(Effect.orDie),
            )
          }),
        )
        const cancellationRequested = store.loadExecution(runId).pipe(
          Effect.map((run) => run.cancellationRequested),
          Effect.catchTag("generalist/runtime/RunNotFound", () => Effect.succeed(false)),
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
    return { execute, interrupt: (runId) => active.interrupt(runId) }
  })

export const forAgents = (agents: RegisteredAgents) => makeFor(agents)
export const make = Effect.suspend(() => makeFor(makeRegisteredAgents()))
