/* eslint-disable max-lines -- compaction preparation, operation replay, and session projection remain one ownership path. */
import { Clock, Effect, Equal, Exit, Option, Ref, Schema } from "effect"
import { AiError, Chat, Model, Prompt, Tokenizer } from "effect/unstable/ai"
import { conservativeContextWindow, contextWindow as catalogContextWindow } from "../../ai/model-catalog.js"
import { AgentError, MiddlewareViolation } from "./event.js"
import { Compaction, defaultReserveTokens, Result as CompactionResult, type Usage } from "../turn/compaction.js"
import { usableReserveTokens } from "../turn/compaction-service.js"
import { diagnose as diagnoseSessionSync } from "../context/session-sync.js"
import { SessionSyncInternals } from "./session/sync.js"
import {
  checkpointMatches,
  buildContext,
  SessionConflict,
  type Entry,
  type SessionStore,
  type CompactionEntry,
  type SessionStoreError,
} from "../context/session.js"
import { recalledMessages, detachEntry, detachPrompt, preservesRecalledMessages } from "./message.js"
import { conversationOnly, withDerivedSystem } from "./session/history.js"
import { promptDigest } from "./prompt-identity.js"
import {
  cursorFromPath,
  pathFromCursor,
  SessionCursor,
  type SessionCursor as SessionCursorType,
} from "./session/cursor.js"
import type { CompactionCommit, Event as ModelTelemetryEvent } from "../model/telemetry/events.js"
import type { RunOptions } from "./service.js"
import { RunError } from "./run/error.js"
import type { AgentRunState } from "./run-state.js"
import { estimatePromptTokens } from "../turn/prompt-token-estimate.js"
import { intercept, logicalOperationId } from "../durable/driver/run.js"
import { digest as canonicalDigest } from "../durable/canonical-json.js"
import { operationKey, type DriverInterpreter } from "../durable/driver/interpreter.js"
import type { Key, Memory, MemoryError } from "../context/memory.js"
import type { SkillCatalogError } from "../context/skill-catalog.js"
import { CompactionProjection } from "./session/compaction-projection.js"
import { compaction as applyCompactionHooks } from "./lifecycle/hooks.js"
import type { RunId } from "../durable/run-id.js"
import {
  currentOption as currentTasks,
  retain as retainTasks,
  withCurrent as withCurrentTasks,
} from "../../tasks/internal.js"
import { clearTaint } from "../capability/internal.js"
type CompactionContext = {
  readonly runId: RunId
  readonly activeSession: Option.Option<SessionStore>
  readonly sessionId: string
  readonly chat: Chat.Service
  readonly system: string | undefined
  readonly options: RunOptions
  readonly state: AgentRunState
  readonly compactionService: Option.Option<typeof Compaction.Service>
  readonly tokenizerService: Option.Option<typeof Tokenizer.Tokenizer.Service>
  readonly deliverPending: Effect.Effect<void, import("../model/telemetry/events.js").SinkFailed>
  readonly undeliveredTelemetry: Array<ModelTelemetryEvent>
  readonly emitTelemetry: (event: import("../model/telemetry/events.js").EventPayload) => Effect.Effect<void>
  readonly prepareTelemetry: (event: import("../model/telemetry/events.js").EventPayload) => ModelTelemetryEvent
  readonly publishTelemetry: (event: ModelTelemetryEvent) => void
  readonly errorMessage: (error: AiError.AiError) => string
  readonly agent: {
    readonly name: string
    readonly model?: { readonly provider: string; readonly model: string }
  }
  readonly memoryRuntime: { readonly key: Key; readonly service: typeof Memory.Service } | undefined
  readonly memoryError: (turn: number, error: MemoryError) => AgentError
  readonly skillError: (turn: number, error: SkillCatalogError) => AgentError
  readonly compactionError: (turn: number, error: import("../turn/compaction.js").CompactionError) => AgentError
  readonly sessionError: (turn: number, error: SessionStoreError | SessionConflict) => AgentError
}
export const make = (context: CompactionContext) => {
  const {
    runId,
    activeSession,
    sessionId,
    chat,
    system,
    options,
    state,
    compactionService,
    tokenizerService,
    deliverPending,
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
  const { isAppendOnlyDescendant, sessionTranscriptCursor } = SessionSyncInternals
  const resolveCursor = (turn: number, cursor: SessionCursorType) =>
    pathFromCursor({ turn, cursor, session: activeSession, sessionError })
  const appendTranscript = (
    transcript: Prompt.Prompt,
    cursor: number,
    path: ReadonlyArray<Entry>,
    session: SessionStore,
    invocationId: string,
  ) =>
    Effect.gen(function* () {
      let expectedLeafId = path.at(-1)?.id ?? null
      for (const [position, message] of transcript.content.entries()) {
        if (position < cursor || message.role === "system") continue
        const id = canonicalDigest(["session-entry", invocationId, position, message.role])
        const appended = yield* session.append({ _tag: "Message", message }, { expectedLeafId, id })
        expectedLeafId = appended.id
      }
      return expectedLeafId === (path.at(-1)?.id ?? null) ? path : yield* session.path()
    })
  const syncSessionBody = (
    turn: number,
    transcript: Prompt.Prompt,
    invocationId: string,
  ): Effect.Effect<SessionCursor, AgentError> =>
    Option.match(activeSession, {
      onNone: () => Effect.succeed({ leafId: null }),
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
              return cursorFromPath(path)
            }
            const diagnostics = {
              sessionId,
              durableEntryTags: path.map((entry) => entry._tag),
              projection: projection.content,
              transcript: transcript.content,
            }
            return yield* AgentError.make({
              message: "Session projection is not a prefix of live Chat history",
              turn,
              diagnostics: diagnoseSessionSync(diagnostics),
            })
          }
          path = yield* appendTranscript(transcript, cursor.value, path, session, invocationId)
          return cursorFromPath(path)
        }).pipe(Effect.mapError((error) => (Schema.is(AgentError)(error) ? error : sessionError(turn, error)))),
    })
  const syncSession = (
    turn: number,
    transcript: Prompt.Prompt,
    invocationId: string,
  ): Effect.Effect<ReadonlyArray<Entry>, RunError, DriverInterpreter> =>
    Effect.gen(function* () {
      const key = operationKey(yield* logicalOperationId, "memory", "sync", turn, invocationId)
      const transcriptDigest = promptDigest(conversationOnly(transcript).content)
      return yield* intercept(
        {
          kind: "memory",
          key,
          turn,
          input: {
            turn,
            messageCount: transcript.content.length,
            transcriptDigest,
          },
          replayPolicy: "pure",
          success: SessionCursor,
          failure: RunError,
        },
        syncSessionBody(turn, transcript, key),
      ).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(SessionCursor)),
        Effect.mapError((error) =>
          Schema.is(RunError)(error)
            ? error
            : AgentError.make({ message: `Invalid Session cursor: ${String(error)}`, turn, cause: error }),
        ),
        Effect.flatMap((cursor) => resolveCursor(turn, cursor)),
      )
    })
  const sessionPathForCompaction = (
    turn: number,
    history: Prompt.Prompt,
    prompt: Prompt.Prompt,
    invocationId: string,
  ): Effect.Effect<ReadonlyArray<Entry>, RunError, DriverInterpreter> =>
    Option.match(activeSession, {
      onNone: () => Effect.succeed([]),
      onSome: (session) =>
        Effect.gen(function* () {
          const path = yield* session.path().pipe(Effect.mapError((error) => sessionError(turn, error)))
          const projection = buildContext(path)
          if (
            projection.content.length > conversationOnly(history).content.length &&
            Option.isSome(sessionTranscriptCursor(projection.content, Prompt.concat(history, prompt).content))
          )
            return path
          return yield* syncSession(turn, history, operationKey(invocationId, "before-compaction"))
        }),
    })
  const countTokens = (turn: number, prompt: Prompt.Prompt): Effect.Effect<number, AgentError> =>
    Option.match(tokenizerService, {
      onNone: () => Effect.succeed(estimatePromptTokens(prompt)),
      onSome: (tokenizer) =>
        tokenizer.tokenize(prompt).pipe(
          Effect.map((tokens) => tokens.length),
          Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn, cause: error })),
        ),
    })
  const compactionUsage = (
    turn: number,
    history: Prompt.Prompt,
    prompt: Prompt.Prompt,
  ): Effect.Effect<Usage, AgentError> => {
    const promptContext = Prompt.concat(history, prompt)
    return Effect.gen(function* () {
      const estimatedTokens = yield* countTokens(turn, promptContext)
      const reported = state.reportedContextUsage
      const canApplyReportedGrowth =
        reported !== undefined &&
        isAppendOnlyDescendant(reported.prompt, promptContext) &&
        estimatedTokens >= reported.estimatedTokens
      const contextTokens = canApplyReportedGrowth
        ? reported.reportedTokens + estimatedTokens - reported.estimatedTokens
        : estimatedTokens
      if (reported !== undefined && !canApplyReportedGrowth) state.reportedContextUsage = undefined
      let contextWindow = options.compaction?.contextWindow
      if (contextWindow === undefined) {
        const provider = yield* Effect.serviceOption(Model.ProviderName)
        const model = yield* Effect.serviceOption(Model.ModelName)
        const selection =
          agent.model ??
          (Option.isSome(provider) && Option.isSome(model)
            ? { provider: provider.value, model: model.value }
            : undefined)
        if (selection === undefined) {
          contextWindow = Number.POSITIVE_INFINITY
        } else {
          const catalogWindow = yield* catalogContextWindow(selection)
          contextWindow = Option.getOrElse(catalogWindow, () => conservativeContextWindow)
        }
      }
      return {
        contextTokens,
        contextWindow,
        reserveTokens: usableReserveTokens(contextWindow, options.compaction?.reserveTokens ?? defaultReserveTokens),
      }
    })
  }
  const applyCompactionResultBody = (
    turn: number,
    result: CompactionResult,
    parentId: string | null,
    commandId: string,
    commitData?: Omit<CompactionCommit, "checkpointId" | "summaryModelCallId">,
    onCommitted?: () => void,
  ): Effect.Effect<void, RunError> =>
    Option.match(activeSession, {
      onNone: () => {
        const checkpointId = commitData?.compactionId ?? "compaction"
        const commit = commitData === undefined ? undefined : { ...commitData, checkpointId }
        return Ref.set(chat.history, Prompt.concat(result.history, result.prompt)).pipe(
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
          const id = yield* session.reserveEntryId(commandId)
          const existing = yield* session.entry(id)
          const previous: CompactionEntry | undefined = existing?._tag === "Compaction" ? existing : undefined
          const previousTelemetry = previous?.telemetry
          const telemetryBeforeApplied = Object.freeze([...undeliveredTelemetry])
          let compactionCommit: CompactionCommit | undefined
          if (commitData !== undefined) {
            const isSummaryCall = (
              event: ModelTelemetryEvent,
            ): event is Extract<ModelTelemetryEvent, { readonly _tag: "ModelCallStarted" }> =>
              event._tag === "ModelCallStarted" && event.compactionId === commitData.compactionId
            const summaryCall = (previousTelemetry ?? telemetryBeforeApplied).findLast(isSummaryCall)
            const commitBase = { ...commitData, checkpointId: id }
            compactionCommit =
              summaryCall === undefined ? commitBase : { ...commitBase, summaryModelCallId: summaryCall.modelCallId }
          }
          const applied =
            compactionCommit === undefined
              ? undefined
              : (previousTelemetry?.findLast(
                  (event) => event._tag === "CompactionApplied" && event.checkpointId === id,
                ) ??
                prepareTelemetry({
                  _tag: "CompactionApplied",
                  turn,
                  compactionId: compactionCommit.compactionId,
                  checkpointId: id,
                  kind: result._tag === "Summarize" ? "summarize" : "microcompact",
                  appliedAt: yield* Clock.currentTimeMillis,
                  commit: compactionCommit,
                }))
          const telemetry =
            previousTelemetry ?? Object.freeze([...telemetryBeforeApplied, ...(applied === undefined ? [] : [applied])])
          const projectedHistory = conversationOnly(result.history)
          const checkpointBase = {
            id,
            parentId,
            projectedHistory,
            telemetry,
          }
          const checkpointWithCommit =
            compactionCommit === undefined ? checkpointBase : { ...checkpointBase, compactionCommit }
          const expectedCheckpoint =
            result._tag === "Summarize" ? { ...checkpointWithCommit, summary: result.summary } : checkpointWithCommit
          yield* Effect.uninterruptibleMask((restore) =>
            restore(
              session.appendCheckpoint(expectedCheckpoint).pipe(
                Effect.filterOrFail(
                  (appended) => checkpointMatches(appended.checkpoint, expectedCheckpoint),
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
                  if (previous === undefined) {
                    undeliveredTelemetry.splice(0, telemetryBeforeApplied.length)
                  } else {
                    const committed = new Set(previous.telemetry.map((event) => event.deliveryId))
                    let remaining = 0
                    for (const event of undeliveredTelemetry) {
                      if (!committed.has(event.deliveryId)) undeliveredTelemetry[remaining++] = event
                    }
                    undeliveredTelemetry.length = remaining
                  }
                  if (applied !== undefined) publishTelemetry(applied)
                  onCommitted?.()
                }),
              ),
              Effect.flatMap((appended) => restore(session.effectivePath(appended.leafId))),
              Effect.map(buildContext),
              Effect.tap((projection) => Ref.set(chat.history, withDerivedSystem({ system, projection }))),
              Effect.tap(() =>
                Effect.sync(() => {
                  state.reportedContextUsage = undefined
                }),
              ),
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
  ): Effect.Effect<void, RunError, DriverInterpreter> =>
    Effect.gen(function* () {
      const tasks = yield* currentTasks
      const retained = Option.isSome(tasks) ? retainTasks(result, tasks.value) : result
      const logicalId = yield* logicalOperationId
      const commandId = operationKey(logicalId, "compaction", "apply", turn, applicationIdentity)
      const interceptionBase = {
        turn,
        tag: retained._tag,
        applicationIdentity,
        parentId,
        result: yield* Schema.encodeEffect(CompactionResult)(retained).pipe(
          Effect.mapError((error) => AgentError.make({ turn, message: error.message })),
        ),
      }
      const interceptionInput =
        commitData === undefined ? interceptionBase : { ...interceptionBase, compactionCommit: commitData }
      yield* intercept(
        {
          kind: "compaction",
          key: commandId,
          turn,
          input: interceptionInput,
          replayPolicy: "pure",
          success: Schema.Void,
          failure: RunError,
        },
        applyCompactionResultBody(turn, retained, parentId, commandId, commitData, onCommitted),
      )
      if (Option.isSome(tasks)) yield* Ref.update(chat.history, (history) => withCurrentTasks(history, tasks.value))
    })
  const historyWithCurrentTasks = Effect.gen(function* () {
    const history = yield* Ref.get(chat.history)
    const tasks = yield* currentTasks
    if (Option.isNone(tasks)) return { history, tasks }
    const retained = withCurrentTasks(history, tasks.value)
    yield* Ref.set(chat.history, retained)
    return { history: retained, tasks }
  })
  const preparePrompt = (turn: number, prompt: Prompt.Prompt, overflow: boolean, invocationId: string) =>
    Option.match(compactionService, {
      onNone: () => historyWithCurrentTasks.pipe(Effect.as({ prompt, changed: false })),
      onSome: (compaction) =>
        Effect.gen(function* () {
          const current = yield* historyWithCurrentTasks
          const history = current.history
          const path = yield* sessionPathForCompaction(turn, history, prompt, invocationId)
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
          const logicalId = yield* logicalOperationId
          const compactionId = operationKey(logicalId, "compaction", turn, invocationId)
          const compactBase = {
            compactionId,
            agentName: agent.name,
            sessionId,
            runId: logicalId,
            turn,
            history: detachedHistory,
            prompt: detachedPrompt,
            path: detachedPath,
            usage,
            overflow,
          }
          const compactInput =
            options.toolOutputMaxBytes === undefined
              ? compactBase
              : { ...compactBase, toolOutputMaxBytes: options.toolOutputMaxBytes }
          const hook = yield* applyCompactionHooks({
            runId,
            agentName: agent.name,
            turn,
            before: Prompt.concat(detachedHistory, detachedPrompt),
            overflow,
            history: compactInput.history,
            prompt: compactInput.prompt,
          })
          const hookedInput = { ...compactInput, history: hook.input.history, prompt: hook.input.prompt }
          const compactEffect =
            hook.blocked === undefined
              ? Effect.scoped(compaction.maybeCompact(hookedInput)).pipe(
                  Effect.mapError((error) => compactionError(turn, error)),
                )
              : Effect.succeed(Option.none<CompactionResult>())
          const compacted = overflow
            ? yield* compactEffect
            : yield* intercept(
                {
                  kind: "compaction",
                  key: operationKey(logicalId, "compaction", turn, compactionId),
                  turn,
                  input: { turn, compactionId, agentName: agent.name, sessionId },
                  replayPolicy: "pure",
                  success: Schema.OptionFromNullOr(CompactionResult),
                  failure: RunError,
                },
                compactEffect,
              )
          if (Option.isNone(compacted)) return { prompt, changed: false }
          const result = Option.isSome(current.tasks)
            ? retainTasks(compacted.value, current.tasks.value)
            : compacted.value
          let applicationCommitted = false
          return yield* Effect.gen(function* () {
            const changed =
              !Equal.equals(originalHistory.content, result.history.content) ||
              !Equal.equals(originalPrompt.content, result.prompt.content)
            if (!changed) {
              const skippedAt = yield* Clock.currentTimeMillis
              yield* emitTelemetry({ _tag: "CompactionSkipped", turn, compactionId, skippedAt })
              return { prompt, changed: false }
            }
            const allowed = [...historyRecalled, ...promptRecalled]
            const required = Option.isSome(activeSession) ? promptRecalled : allowed
            if (!preservesRecalledMessages(allowed, required, Prompt.concat(result.history, result.prompt))) {
              return yield* MiddlewareViolation.make({
                turn,
                detail: "Compaction must preserve recalled-memory message lineage outside the lossless Session path",
              })
            }
            yield* CompactionProjection.validate(turn, result)
            const after = Prompt.concat(result.history, result.prompt)
            const contextTokensAfter = yield* Effect.option(countTokens(turn, after))
            const commitBase = {
              compactionId,
              contextTokensBefore: usage.contextTokens,
              entriesBefore: Prompt.concat(history, prompt).content.length,
              entriesAfter: after.content.length,
            }
            const commit = Option.isSome(contextTokensAfter)
              ? { ...commitBase, contextTokensAfter: contextTokensAfter.value }
              : commitBase
            yield* applyCompactionResult(turn, result, path.at(-1)?.id ?? null, compactionId, commit, () => {
              applicationCommitted = true
            })
            yield* clearTaint(turn, compactionId)
            return {
              prompt: Option.isNone(activeSession) ? Prompt.fromMessages([]) : result.prompt,
              changed: true,
            }
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
