// @ts-nocheck
/* oxlint-disable */
import { Effect, Equal, Option, Ref, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { AgentError, MiddlewareViolation } from "../agent-event.js"
import { DEFAULT_RESERVE_TOKENS } from "../compaction.js"
import { diagnose as diagnoseSessionSync, equivalentMessages } from "../session-sync.js"
import { checkpointMatches, buildContext, buildMemoryContext } from "../session.js"
import { recalledMessages, detachEntry, detachPrompt, preservesRecalledMessages } from "../agent-message.js"
import { generateId } from "../model-telemetry.js"

export const makeCompactionRuntime = (context: any): any => {
  const {
    activeSession,
    sessionService,
    sessionId,
    sessionOwnerToken,
    sessionAppendOptions,
    chat,
    persisted,
    options,
    compactionService,
    tokenizerService,
    deliverPending,
    savePersisted,
    undeliveredTelemetry,
    errorMessage,
    agent,
    memoryRuntime,
    memoryError,
    skillError,
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

  const syncSession = (turn: number, transcript: Prompt.Prompt): Effect.Effect<ReadonlyArray<Entry>, AgentError> =>
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
            if (
              checkpoint?._tag === "Compaction" &&
              checkpoint.version === 2 &&
              promptEquivalence(before, transcript)
            ) {
              yield* Ref.set(chat.history, projection)
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
          for (const message of transcript.content.slice(cursor.value)) {
            const appended = yield* session.append({ _tag: "Message", message }, sessionAppendOptions(expectedLeafId))
            expectedLeafId = appended.id
          }
          if (expectedLeafId !== (path.at(-1)?.id ?? null)) path = yield* session.path()
          return path
        }).pipe(Effect.mapError((error) => (Schema.is(AgentError)(error) ? error : sessionError(turn, error)))),
    })

  const countTokens = (turn: number, prompt: Prompt.Prompt): Effect.Effect<number, AgentError> =>
    Option.match(tokenizerService, {
      onNone: () => Effect.succeed(Math.ceil(JSON.stringify(prompt.content).length / 4)),
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
  ): Effect.Effect<Usage, AgentError> =>
    countTokens(turn, Prompt.concat(history, prompt)).pipe(
      Effect.map((contextTokens) => ({
        contextTokens,
        contextWindow: options.compaction?.contextWindow ?? Number.POSITIVE_INFINITY,
        reserveTokens: DEFAULT_RESERVE_TOKENS,
      })),
    )

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

  const applyCompactionResult = (
    turn: number,
    result: CompactionResult,
    parentId: string | null,
    commitData?: Omit<import("./model-telemetry.js").CompactionCommit, "checkpointId" | "summaryModelCallId">,
  ): Effect.Effect<void, RunError> =>
    Option.match(activeSession, {
      onNone: () => deliverPending().pipe(Effect.andThen(Ref.set(chat.history, result.history))),
      onSome: (session) =>
        Effect.gen(function* () {
          const id = yield* session.reserveEntryId
          const telemetry = Object.freeze([...undeliveredTelemetry])
          const completed: Extract<ModelTelemetryEvent, { readonly _tag: "CompactionCompleted" }> | undefined =
            commitData === undefined
              ? undefined
              : (telemetry.findLast(
                  (event) => event._tag === "CompactionCompleted" && event.compactionId === commitData.compactionId,
                ) as Extract<ModelTelemetryEvent, { readonly _tag: "CompactionCompleted" }> | undefined)
          if (commitData !== undefined && completed === undefined) {
            return yield* AgentError.make({
              message: `Changed custom compaction ${commitData.compactionId} did not emit CompactionCompleted`,
              turn,
            })
          }
          const compactionCommit =
            commitData === undefined
              ? undefined
              : {
                  ...commitData,
                  checkpointId: id,
                  ...(completed?.summaryModelCallId === undefined
                    ? {}
                    : { summaryModelCallId: completed.summaryModelCallId }),
                }
          yield* Effect.uninterruptibleMask((restore) =>
            restore(
              session
                .appendCheckpoint({
                  id,
                  parentId,
                  projectedHistory: result.history,
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
                        projectedHistory: result.history,
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
                  undeliveredTelemetry.splice(0, telemetry.length)
                }),
              ),
              Effect.flatMap((appended) => restore(session.path(appended.leafId))),
              Effect.map(buildContext),
              Effect.tap((projection) => Ref.set(chat.history, projection)),
              Effect.andThen(restore(savePersisted(turn))),
            ),
          )
        }).pipe(Effect.mapError((error) => (Schema.is(AgentError)(error) ? error : sessionError(turn, error)))),
    })

  const preparePrompt = (
    turn: number,
    prompt: Prompt.Prompt,
    overflow: boolean,
  ): Effect.Effect<
    { readonly prompt: Prompt.Prompt; readonly changed: boolean },
    RunError,
    LanguageModel.LanguageModel
  > =>
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
          const compacted = yield* Effect.scoped(
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
          if (Option.isNone(compacted)) return { prompt, changed: false }
          const changed =
            !Equal.equals(originalHistory.content, compacted.value.history.content) ||
            !Equal.equals(originalPrompt.content, compacted.value.prompt.content)
          if (!changed) return { prompt, changed: false }
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
          yield* applyCompactionResult(turn, compacted.value, path.at(-1)?.id ?? null, {
            compactionId,
            contextTokensBefore: usage.contextTokens,
            ...(Option.isSome(contextTokensAfter) ? { contextTokensAfter: contextTokensAfter.value } : {}),
            entriesBefore: Prompt.concat(history, prompt).content.length,
            entriesAfter: after.content.length,
          })
          return { prompt: compacted.value.prompt, changed: true }
        }),
    })
  return { preparePrompt, applyCompactionResult, compactionUsage, syncSession }
}
