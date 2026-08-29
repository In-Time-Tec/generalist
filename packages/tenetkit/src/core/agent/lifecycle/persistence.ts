import { Effect, Option, Ref, Schema } from "effect"
import { Chat, Prompt } from "effect/unstable/ai"
import {
  buildContext,
  type DirectoryInterface,
  type Interface as SessionStore,
  SessionDirectory,
} from "../../context/session.js"
import { Compaction } from "../../turn/compaction.js"
import { AgentError, ResumeMismatch } from "../event.js"
import { Runtime } from "../persistence-lock.js"
import { type Interface as ToolContextInterface, ToolContext } from "../../tools/tool-context.js"
import type { RunOptions } from "../service.js"
import {
  initialChat,
  resumeChat as chatForResume,
  seedFromSession,
  SessionHistoryInternal,
  withDerivedSystem,
} from "../session/history.js"
import type { SuspensionCheckpoint } from "../suspension.js"

const errorMessage = String

const acquireSession = (
  sessionId: string | undefined,
  directory: Option.Option<DirectoryInterface>,
  toolContext: Option.Option<ToolContextInterface>,
): Effect.Effect<Option.Option<SessionStore>, AgentError, import("effect").Scope.Scope> => {
  if (sessionId === undefined || Option.isNone(directory)) return Effect.succeedNone
  if (Option.isSome(toolContext) && sessionId === toolContext.value.sessionId) {
    return Effect.fail(
      AgentError.make({
        message: `Nested Agent Run cannot acquire its active parent Session ${sessionId}`,
        turn: 0,
      }),
    )
  }
  return directory.value.acquire(sessionId).pipe(
    Effect.map(Option.some),
    Effect.mapError((error) => AgentError.make({ message: error.message, turn: 0, cause: error })),
  )
}

export const setupPersistence = (options: RunOptions) =>
  Effect.gen(function* () {
    const persistenceOptions = options.persistence
    const resume = options.resume
    const persistenceService = yield* Effect.serviceOption(Chat.Persistence)
    const runtimeService = yield* Effect.serviceOption(Runtime)
    const compactionService = yield* Effect.serviceOption(Compaction)
    const sessionDirectory = yield* Effect.serviceOption(SessionDirectory)
    const toolContext = yield* Effect.serviceOption(ToolContext)
    const activeSession = yield* acquireSession(options.sessionId, sessionDirectory, toolContext)
    const persisted: Chat.Persisted | undefined =
      persistenceOptions === undefined
        ? undefined
        : yield* Option.match(persistenceService, {
            onNone: () =>
              Effect.fail(
                AgentError.make({ message: "RunOptions.persistence requires Chat.Persistence in context", turn: 0 }),
              ),
            onSome: (service) =>
              Effect.gen(function* () {
                const runtime = yield* Option.match(runtimeService, {
                  onNone: () =>
                    Effect.fail(
                      AgentError.make({ message: "RunOptions.persistence requires Agent.Runtime in context", turn: 0 }),
                    ),
                  onSome: Effect.succeed,
                })
                const semaphore = yield* runtime.persistenceSemaphore(service, persistenceOptions.chatId)
                yield* Effect.acquireRelease(semaphore.take(1), () => semaphore.release(1), { interruptible: true })
                const getOptions =
                  persistenceOptions.timeToLive === undefined
                    ? undefined
                    : { timeToLive: persistenceOptions.timeToLive }
                return yield* resume === undefined
                  ? service
                      .getOrCreate(persistenceOptions.chatId, getOptions)
                      .pipe(
                        Effect.mapError((error) =>
                          AgentError.make({ message: errorMessage(error), turn: 0, cause: error }),
                        ),
                      )
                  : service
                      .get(persistenceOptions.chatId, getOptions)
                      .pipe(
                        Effect.mapError((error) =>
                          error._tag === "ChatNotFoundError"
                            ? ResumeMismatch.make({ reason: "checkpoint-not-found", received: resume.suspension })
                            : AgentError.make({ message: errorMessage(error), turn: 0, cause: error }),
                        ),
                      )
              }),
          })
    let recoveredHistory: Prompt.Prompt | undefined
    if (
      resume !== undefined &&
      persisted !== undefined &&
      Option.isSome(compactionService) &&
      Option.isSome(activeSession)
    ) {
      yield* Effect.gen(function* () {
        const path = yield* activeSession.value.path()
        const checkpoint = path.at(-1)
        if (checkpoint?._tag !== "Compaction") return
        const history = yield* Ref.get(persisted.history)
        const before = buildContext(path.slice(0, -1))
        if (!Schema.toEquivalence(Prompt.Prompt)(before, history)) return
        recoveredHistory = buildContext(path)
      }).pipe(Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn: 0, cause: error })))
    }
    let resumeChat: Chat.Service | undefined
    let validatedResume: SuspensionCheckpoint | undefined
    if (resume !== undefined) {
      resumeChat = yield* chatForResume({ persisted, activeSession, suppliedHistory: options.history }).pipe(
        Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn: 0, cause: error })),
      )
      const resumeHistory = recoveredHistory ?? (yield* Ref.get(resumeChat.history))
      validatedResume = yield* SessionHistoryInternal.validateResume(resumeHistory, resume.suspension)
      if (recoveredHistory !== undefined && persisted !== undefined) {
        yield* Ref.set(persisted.history, recoveredHistory)
        yield* persisted.save.pipe(
          Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn: 0, cause: error })),
        )
      }
    }
    return {
      persistenceOptions,
      resume,
      persistenceService,
      runtimeService,
      compactionService,
      activeSession,
      persisted,
      recoveredHistory,
      resumeChat,
      validatedResume,
    }
  })

/** @internal Materialize the run chat after persistence and prompt resolution agree. */
export const setupChat = (args: {
  readonly options: RunOptions
  readonly activeSession: Option.Option<SessionStore>
  readonly persisted: Chat.Persisted | undefined
  readonly resumeChat: Chat.Service | undefined
  readonly system: string | undefined
  readonly supplemental: string | undefined
}) =>
  Effect.gen(function* () {
    const shouldSeedSystem =
      args.persisted !== undefined &&
      args.system !== undefined &&
      (yield* Ref.get(args.persisted.history)).content.length === 0
    const seededInstructions =
      args.system === undefined || args.supplemental === undefined
        ? args.system
        : `${args.system}\n\n${args.supplemental}`
    const seedSystem = shouldSeedSystem ? seededInstructions : undefined
    const sessionHistory = yield* seedFromSession({
      activeSession: args.activeSession,
      suppliedHistory: args.options.history,
    }).pipe(Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn: 0, cause: error })))
    const freshChat = initialChat({
      sessionHistory,
      suppliedHistory: args.options.history,
      system: args.system,
      supplemental: args.supplemental,
    })
    if (args.persisted !== undefined && Option.isSome(sessionHistory)) {
      yield* Ref.set(
        args.persisted.history,
        withDerivedSystem({ system: args.system, supplemental: args.supplemental, projection: sessionHistory.value }),
      ).pipe(
        Effect.andThen(args.persisted.save),
        Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn: 0, cause: error })),
      )
    }
    const chat: Chat.Service = args.resumeChat ?? args.persisted ?? (yield* freshChat)
    return { seedSystem, freshChat, chat }
  })
