import { Effect, Option, Ref } from "effect"
import { Chat } from "effect/unstable/ai"
import { type DirectoryInterface, type Interface as SessionStore, SessionDirectory } from "../../context/session.js"
import { Compaction } from "../../turn/compaction.js"
import { AgentError, ResumeMismatch } from "../event.js"
import { validResolutions } from "../suspension.js"
import { type Interface as ToolContextInterface, ToolContext } from "../../tools/tool-context.js"
import type { RunOptions } from "../service.js"
import {
  initialChat,
  resumeChat as chatForResume,
  seedFromSession,
  SessionHistoryInternal,
} from "../session/history.js"

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

export const setupSession = (options: RunOptions) =>
  Effect.gen(function* () {
    if (
      options.resume !== undefined &&
      !validResolutions(options.resume.suspension, options.resume.resolutions ?? [])
    ) {
      return yield* ResumeMismatch.make({
        reason: "identity-mismatch",
        received: options.resume.suspension,
      })
    }
    const compactionService = yield* Effect.serviceOption(Compaction)
    const sessionDirectory = yield* Effect.serviceOption(SessionDirectory)
    const toolContext = yield* Effect.serviceOption(ToolContext)
    const activeSession = yield* acquireSession(options.sessionId, sessionDirectory, toolContext)
    const resume = options.resume
    let resumeChat: Chat.Service | undefined
    let validatedResume: import("../suspension.js").SuspensionCheckpoint | undefined
    if (resume !== undefined) {
      resumeChat = yield* chatForResume({ activeSession, suppliedHistory: options.history }).pipe(
        Effect.mapError((error) => AgentError.make({ message: error.message, turn: 0, cause: error })),
      )
      validatedResume = yield* SessionHistoryInternal.validateResume(
        yield* Ref.get(resumeChat.history),
        resume.suspension,
      )
    }
    return { resume, compactionService, activeSession, resumeChat, validatedResume }
  })

export const setupChat = (args: {
  readonly options: RunOptions
  readonly activeSession: Option.Option<SessionStore>
  readonly resumeChat: Chat.Service | undefined
  readonly system: string | undefined
  readonly supplemental: string | undefined
}) =>
  Effect.gen(function* () {
    const sessionHistory = yield* seedFromSession({
      activeSession: args.activeSession,
      suppliedHistory: args.options.history,
    }).pipe(Effect.mapError((error) => AgentError.make({ message: error.message, turn: 0, cause: error })))
    const freshChat = initialChat({
      sessionHistory,
      suppliedHistory: args.options.history,
      system: args.system,
      supplemental: args.supplemental,
    })
    return { seedSystem: undefined, freshChat, chat: args.resumeChat ?? (yield* freshChat) }
  })
