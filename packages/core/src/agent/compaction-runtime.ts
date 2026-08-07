import { Clock, Effect, Equal, Exit, Option, Ref, Schema } from "effect"
import { Chat, Prompt, Tokenizer } from "effect/unstable/ai"
import { AgentError, MiddlewareViolation } from "./agent-event.js"
import {
  Compaction,
  DEFAULT_RESERVE_TOKENS,
  type CompactionError,
  type Result as CompactionResult,
  type Usage,
} from "../turn/compaction.js"
import { diagnose as diagnoseSessionSync, equivalentMessages } from "../context/session-sync.js"
import { checkpointMatches, buildContext } from "../context/session.js"
import { recalledMessages, detachEntry, detachPrompt, preservesRecalledMessages } from "./agent-message.js"
import { conversationOnly, withDerivedSystem } from "./session-history.js"
import { type CompactionCommit, type Event as ModelTelemetryEvent, generateId } from "../model/model-telemetry.js"
import type { RunError, RunOptions } from "./agent.js"
import type { AgentRunState } from "./agent-run-state.js"
import { estimatePromptTokens } from "../turn/prompt-token-estimate.js"
import { SessionConflict, SessionStore, type Entry, type SessionStoreError } from "../context/session.js"
import { intercept } from "../durable/driver-run.js"
import { operationKey } from "../durable/driver-interpreter.js"
import type { MemoryError } from "../context/memory.js"
import type { SkillSourceError } from "../context/skill-source.js"
type CompactionContext = {
  readonly activeSession: Option.Option<typeof SessionStore.Service>
  readonly sessionService: Option.Option<typeof SessionStore.Service>
  readonly sessionId: string
  readonly sessionOwnerToken: string | undefined
  readonly sessionAppendOptions: (expectedLeafId: string | null) => {
    readonly expectedLeafId: string | null
    readonly ownerToken?: string
  }
  readonly chat: Chat.Service
  readonly system: string | undefined
  readonly persisted: Chat.Persisted | undefined
  readonly options: RunOptions
  readonly state: AgentRunState
  readonly compactionService: Option.Option<typeof Compaction.Service>
  readonly tokenizerService: Option.Option<typeof Tokenizer.Tokenizer.Service>
  readonly deliverPending: Effect.Effect<void, import("../model/model-telemetry.js").DeliveryFailed>
  readonly savePersisted: (turn: number) => Effect.Effect<void, AgentError>
  readonly undeliveredTelemetry: Array<ModelTelemetryEvent>
  readonly emitTelemetry: (event: import("../model/model-telemetry.js").EventPayload) => Effect.Effect<void>
  readonly prepareTelemetry: (event: import("../model/model-telemetry.js").EventPayload) => ModelTelemetryEvent
  readonly publishTelemetry: (event: ModelTelemetryEvent) => void
  readonly errorMessage: (error: unknown) => string
  readonly agent: { readonly name: string }
  readonly memoryRuntime: unknown | undefined
  readonly memoryError: (turn: number, error: MemoryError) => AgentError
  readonly skillError: (turn: number, error: SkillSourceError) => AgentError
  readonly compactionError: (turn: number, error: CompactionError) => AgentError
  readonly sessionError: (turn: number, error: SessionStoreError | SessionConflict) => AgentError
}

export const makeCompactionRuntime = (context: CompactionContext) => {
  const {
    activeSession,
    sessionId,
    sessionOwnerToken,
    sessionAppendOptions,
    chat,
    system,
    options,
    state,
    compactionService,
    tokenizerService,
    deliverPending,
    savePersisted,
    undeliveredTelemetry,
    emitTelemetry,
    prepareTelemetry,
    publishTelemetry,
    errorMessage,
    agent,
    compactionError,
    sessionError,
  } = context
  const promptEquivalence = Schema.toEquivalence(Prompt.Prompt)
  const sessionTranscriptCursor = (
    projection: ReadonlyArray<Prompt.Message>,
    transcript: ReadonlyArray<Prompt.Message>,
  ): Option.Option<number> => {
    if (projection.length === 0) return Option.some(0)
    const matches: Array<number> = []
    for (let start = 0; start <= transcript.length - projection.length; start += 1) {
      if (
        transcript.slice(0, start).every((message) => message.role === "system") &&
        projection.every((message, index) => equivalentMessages(message, transcript[start + index] as Prompt.Message))
      ) {
        matches.push(start + projection.length)
      }
    }
    return matches.length === 1 ? Option.some(matches[0] as number) : Option.none()
  }

  const syncSessionBody = (turn: number, transcript: Prompt.Prompt): Effect.Effect<ReadonlyArray<Entry>, AgentError> =>
    Option.match(activeSession, {
      onNone: () => Effect.succeed([]),
      onSome: (session) =>
        Effect.gen(function* () {
          let path = yield* session.path()
          const projection = buildContext(path)
          const cursor = sessionTranscriptCursor(projection.content, transcript.content)
          if (Option.isNone(cursor)) {
            const checkpoint = path.at(-1)
            const before = buildContext(path.slice(0, -1))
            if (checkpoint?._tag === "Compaction" && promptEquivalence(before, transcript)) {
              yield* Ref.set(chat.history, withDerivedSystem({ system, projection }))
              yield* savePersisted(turn)
              return path
            }
            return yield* AgentError.make({
              message: "Session projection is not a prefix of authoritative Chat history",
              turn,
              diagnostics: diagnoseSessionSync({
                sessionId,
                ...(sessionOwnerToken === undefined ? {} : { ownerToken: sessionOwnerToken }),
                durableEntryTags: path.map((entry) => entry._tag),
                projection: projection.content,
                transcript: transcript.content,
              }),
            })
          }
          let expectedLeafId = path.at(-1)?.id ?? null
          // The system message is derived per Run from live instructions, so it never becomes a Session
          // entry. Persisting it would pin a resumed Session to the instructions captured on its first Run.
          for (const message of transcript.content.slice(cursor.value)) {
            if (message.role === "system") continue
            const appended = yield* session.append({ _tag: "Message", message }, sessionAppendOptions(expectedLeafId))
            expectedLeafId = appended.id
          }
          if (expectedLeafId !== (path.at(-1)?.id ?? null)) path = yield* session.path()
          return path
        }).pipe(Effect.mapError((error) => (Schema.is(AgentError)(error) ? error : sessionError(turn, error)))),
    })

  const syncSession = (
    turn: number,
    transcript: Prompt.Prompt,
  ): Effect.Effect<ReadonlyArray<Entry>, RunError, DriverInterpreter> => {
    const logicalId = options.logicalOperationId ?? options.sessionId ?? agent.name
    return intercept(
      {
        kind: "memory",
        key: operationKey(logicalId, "memory", "sync", turn, transcript.content.length),
        input: { turn, messageCount: transcript.content.length },
        replayPolicy: "pure",
      },
      syncSessionBody(turn, transcript),
    )
  }

  const countTokens = (turn: number, prompt: Prompt.Prompt): Effect.Effect<number, AgentError> =>
    Option.match(tokenizerService, {
      onNone: () => Effect.succeed(estimatePromptTokens(prompt)),
      onSome: (tokenizer) =>
        tokenizer.tokenize(prompt).pipe(
          Effect.map((tokens) => tokens.length),
          Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn, cause: error })),
        ),
    })

  const isAppendOnlyDescendant = (ancestor: Prompt.Prompt, descendant: Prompt.Prompt): boolean =>
    ancestor.content.length <= descendant.content.length &&
    ancestor.content.every((message, index) => Equal.equals(message, descendant.content[index]))

  const compactionUsage = (
    turn: number,
    history: Prompt.Prompt,
    prompt: Prompt.Prompt,
  ): Effect.Effect<Usage, AgentError> => {
    const promptContext = Prompt.concat(history, prompt)
    return countTokens(turn, promptContext).pipe(
      Effect.map((estimatedTokens) => {
        const reported = state.reportedContextUsage
        const canApplyReportedGrowth =
          reported !== undefined &&
          isAppendOnlyDescendant(reported.prompt, promptContext) &&
          estimatedTokens >= reported.estimatedTokens
        const contextTokens = canApplyReportedGrowth
          ? reported.reportedTokens + estimatedTokens - reported.estimatedTokens
          : estimatedTokens
        if (reported !== undefined && !canApplyReportedGrowth) state.reportedContextUsage = undefined
        return {
          contextTokens,
          contextWindow: options.compaction?.contextWindow ?? Number.POSITIVE_INFINITY,
          reserveTokens: options.compaction?.reserveTokens ?? DEFAULT_RESERVE_TOKENS,
        }
      }),
    )
  }

  const validateCompactionProjection = (turn: number, result: CompactionResult): Effect.Effect<void, AgentError> => {
    const pending = new Set<string>()
    const optional = new Set<string>()
    for (const message of Prompt.concat(result.history, result.prompt).content) {
      if (typeof message.content === "string") {
        if (pending.size > 0) {
          return Effect.fail(
            AgentError.make({ message: "Compaction projection separates a tool call from its result", turn }),
          )
        }
        optional.clear()
        continue
      }
      const hasResult = message.content.some((part) => part.type === "tool-result")
      if (pending.size > 0 && !hasResult) {
        return Effect.fail(
          AgentError.make({ message: "Compaction projection separates a tool call from its result", turn }),
        )
      }
      if (!hasResult) optional.clear()
      const responseCalls = new Set<string>()
      for (const part of message.content) {
        if (part.type === "tool-call") {
          if (responseCalls.has(part.id)) {
            return Effect.fail(
              AgentError.make({ message: `Compaction projection contains duplicate tool call ${part.id}`, turn }),
            )
          }
          responseCalls.add(part.id)
          if (part.providerExecuted) optional.add(part.id)
          else pending.add(part.id)
        }
        if (part.type === "tool-result") {
          if (!pending.delete(part.id) && !optional.delete(part.id)) {
            return Effect.fail(
              AgentError.make({ message: `Compaction projection contains orphan tool result ${part.id}`, turn }),
            )
          }
        }
      }
    }
    return pending.size === 0
      ? Effect.void
      : Effect.fail(AgentError.make({ message: "Compaction projection contains an unresolved tool call", turn }))
  }
  const applyCompactionResultBody = (
    turn: number,
    result: CompactionResult,
    parentId: string | null,
    commitData?: Omit<CompactionCommit, "checkpointId" | "summaryModelCallId">,
    onCommitted?: () => void,
  ): Effect.Effect<void, RunError> =>
    Option.match(activeSession, {
      onNone: () => {
        const checkpointId = commitData?.compactionId ?? "compaction"
        const commit = commitData === undefined ? undefined : { ...commitData, checkpointId }
        return Ref.set(chat.history, result.history).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              state.reportedContextUsage = undefined
            }),
          ),
          Effect.andThen(
            commit === undefined
              ? Effect.void
              : Effect.flatMap(Clock.currentTimeMillis, (appliedAt) =>
                  emitTelemetry({
                    _tag: "CompactionApplied",
                    turn,
                    compactionId: commit.compactionId,
                    checkpointId,
                    kind: result._tag === "Summarize" ? "summarize" : "microcompact",
                    appliedAt,
                    commit,
                  }),
                ),
          ),
          Effect.andThen(deliverPending),
        )
      },
      onSome: (session) =>
        Effect.gen(function* () {
          const id = yield* session.reserveEntryId
          const telemetryBeforeApplied = Object.freeze([...undeliveredTelemetry])
          const summaryCall: Extract<ModelTelemetryEvent, { readonly _tag: "ModelCallStarted" }> | undefined =
            commitData === undefined
              ? undefined
              : (telemetryBeforeApplied.findLast(
                  (event) => event._tag === "ModelCallStarted" && event.compactionId === commitData.compactionId,
                ) as Extract<ModelTelemetryEvent, { readonly _tag: "ModelCallStarted" }> | undefined)
          const compactionCommit =
            commitData === undefined
              ? undefined
              : {
                  ...commitData,
                  checkpointId: id,
                  ...(summaryCall?.modelCallId === undefined ? {} : { summaryModelCallId: summaryCall.modelCallId }),
                }
          const applied =
            compactionCommit === undefined
              ? undefined
              : prepareTelemetry({
                  _tag: "CompactionApplied",
                  turn,
                  compactionId: compactionCommit.compactionId,
                  checkpointId: id,
                  kind: result._tag === "Summarize" ? "summarize" : "microcompact",
                  appliedAt: yield* Clock.currentTimeMillis,
                  commit: compactionCommit,
                })
          const telemetry = Object.freeze([...telemetryBeforeApplied, ...(applied === undefined ? [] : [applied])])
          const projectedHistory = conversationOnly(result.history)
          yield* Effect.uninterruptibleMask((restore) =>
            restore(
              session
                .appendCheckpoint({
                  id,
                  parentId,
                  projectedHistory,
                  telemetry,
                  ...(compactionCommit === undefined ? {} : { compactionCommit }),
                  ...(result._tag === "Summarize" ? { summary: result.summary } : {}),
                  ...(sessionOwnerToken === undefined ? {} : { ownerToken: sessionOwnerToken }),
                })
                .pipe(
                  Effect.filterOrFail(
                    (appended) =>
                      checkpointMatches(appended.checkpoint, {
                        id,
                        parentId,
                        projectedHistory,
                        telemetry,
                        ...(compactionCommit === undefined ? {} : { compactionCommit }),
                        ...(result._tag === "Summarize" ? { summary: result.summary } : {}),
                      }),
                    () =>
                      SessionConflict.make({
                        reason: "checkpoint-id-reused",
                        message: `Session returned a non-matching checkpoint ${id}`,
                      }),
                  ),
                ),
            ).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  undeliveredTelemetry.splice(0, telemetryBeforeApplied.length)
                  if (applied !== undefined) publishTelemetry(applied)
                  onCommitted?.()
                }),
              ),
              Effect.flatMap((appended) => restore(session.path(appended.leafId))),
              Effect.map(buildContext),
              Effect.tap((projection) => Ref.set(chat.history, withDerivedSystem({ system, projection }))),
              Effect.tap(() =>
                Effect.sync(() => {
                  state.reportedContextUsage = undefined
                }),
              ),
              Effect.andThen(restore(savePersisted(turn))),
            ),
          )
        }).pipe(Effect.mapError((error) => (Schema.is(AgentError)(error) ? error : sessionError(turn, error)))),
    })
  const applyCompactionResult = (
    turn: number,
    result: CompactionResult,
    parentId: string | null,
    applicationIdentity: string,
    commitData?: Omit<CompactionCommit, "checkpointId" | "summaryModelCallId">,
    onCommitted?: () => void,
  ): Effect.Effect<void, RunError, DriverInterpreter> => {
    const logicalId = options.logicalOperationId ?? options.sessionId ?? agent.name
    return intercept(
      {
        kind: "compaction",
        key: operationKey(logicalId, "compaction", "apply", turn, applicationIdentity),
        input: {
          turn,
          tag: result._tag,
          applicationIdentity,
          ...(commitData === undefined ? {} : { compactionId: commitData.compactionId }),
        },
        replayPolicy: "pure",
      },
      applyCompactionResultBody(turn, result, parentId, commitData, onCommitted),
    )
  }
  const preparePrompt = (turn: number, prompt: Prompt.Prompt, overflow: boolean) =>
    Option.match(compactionService, {
      onNone: () => Effect.succeed({ prompt, changed: false }),
      onSome: (compaction) =>
        Effect.gen(function* () {
          const history = yield* Ref.get(chat.history)
          const path = yield* syncSession(turn, history)
          const usage = yield* compactionUsage(turn, history, prompt)
          if (compaction.willCompact !== undefined && !compaction.willCompact({ usage, overflow }))
            return { prompt, changed: false }
          const historyRecalled = recalledMessages(history)
          const promptRecalled = recalledMessages(prompt)
          const detachedHistory = yield* detachPrompt(history).pipe(
            Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
          )
          const detachedPrompt = yield* detachPrompt(prompt).pipe(
            Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
          )
          const originalHistory = yield* detachPrompt(detachedHistory).pipe(
            Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
          )
          const originalPrompt = yield* detachPrompt(detachedPrompt).pipe(
            Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
          )
          const detachedPath = yield* Effect.forEach(path, detachEntry).pipe(
            Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
          )
          const compactionId = yield* generateId
          const logicalId = options.logicalOperationId ?? options.sessionId ?? agent.name
          const compactEffect = Effect.scoped(
            compaction.maybeCompact({
              compactionId,
              agentName: agent.name,
              sessionId,
              turn,
              history: detachedHistory,
              prompt: detachedPrompt,
              path: detachedPath,
              usage,
              overflow,
              ...(options.toolOutputMaxBytes === undefined ? {} : { toolOutputMaxBytes: options.toolOutputMaxBytes }),
            }),
          ).pipe(Effect.mapError((error) => compactionError(turn, error)))
          const compacted = overflow
            ? yield* compactEffect
            : yield* intercept(
                {
                  kind: "compaction",
                  key: operationKey(logicalId, "compaction", turn, compactionId),
                  input: { turn, compactionId, agentName: agent.name, sessionId },
                  replayPolicy: "pure",
                },
                compactEffect,
              )
          if (Option.isNone(compacted)) return { prompt, changed: false }
          let applicationCommitted = false
          return yield* Effect.gen(function* () {
            const changed =
              !Equal.equals(originalHistory.content, compacted.value.history.content) ||
              !Equal.equals(originalPrompt.content, compacted.value.prompt.content)
            if (!changed) {
              const skippedAt = yield* Clock.currentTimeMillis
              yield* emitTelemetry({ _tag: "CompactionSkipped", turn, compactionId, skippedAt })
              return { prompt, changed: false }
            }
            const allowed = [...historyRecalled, ...promptRecalled]
            const required = Option.isSome(activeSession) ? promptRecalled : allowed
            if (
              !preservesRecalledMessages(
                allowed,
                required,
                Prompt.concat(compacted.value.history, compacted.value.prompt),
              )
            ) {
              return yield* MiddlewareViolation.make({
                turn,
                detail: "Compaction must preserve recalled-memory message lineage outside the lossless Session path",
              })
            }
            yield* validateCompactionProjection(turn, compacted.value)
            const after = Prompt.concat(compacted.value.history, compacted.value.prompt)
            const contextTokensAfter = yield* Effect.option(countTokens(turn, after))
            yield* applyCompactionResult(
              turn,
              compacted.value,
              path.at(-1)?.id ?? null,
              compactionId,
              {
                compactionId,
                contextTokensBefore: usage.contextTokens,
                ...(Option.isSome(contextTokensAfter) ? { contextTokensAfter: contextTokensAfter.value } : {}),
                entriesBefore: Prompt.concat(history, prompt).content.length,
                entriesAfter: after.content.length,
              },
              () => {
                applicationCommitted = true
              },
            )
            return { prompt: compacted.value.prompt, changed: true }
          }).pipe(
            Effect.onExit((exit) =>
              Exit.isSuccess(exit) || applicationCommitted
                ? Effect.void
                : Effect.flatMap(Clock.currentTimeMillis, (failedAt) =>
                    emitTelemetry({ _tag: "CompactionFailed", turn, compactionId, failedAt }),
                  ),
            ),
          )
        }),
    })
  return { preparePrompt, applyCompactionResult, compactionUsage, countTokens, syncSession }
}
