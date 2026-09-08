import { Effect } from "effect"
import type { Service as Runtime } from "../runtime/service.js"
import { projectEntry, type ConversationEntry } from "../runtime/session/conversation.js"
import { SessionPageInvalid } from "../runtime/session/page.js"
import type { RuntimeHostSessions, SessionPageError } from "../runtime/session/host.js"
import { RuntimeUnavailable } from "../runtime/errors.js"

export interface SessionReads {
  readonly snapshot: RuntimeHostSessions["sessionSnapshot"]
  readonly history: RuntimeHostSessions["sessionHistoryPage"]
  readonly runs: RuntimeHostSessions["sessionRunsPage"]
  readonly run: RuntimeHostSessions["sessionRunSummary"]
  readonly entry: (sessionId: string, entryId: string) => Effect.Effect<ConversationEntry, SessionPageError>
}

export const make = (runtime: Runtime): SessionReads => ({
  snapshot: runtime.sessionSnapshot,
  history: runtime.sessionHistoryPage,
  runs: runtime.sessionRunsPage,
  run: runtime.sessionRunSummary,
  entry: (sessionId, entryId) =>
    Effect.gen(function* () {
      yield* runtime.session(sessionId)
      if (entryId.length === 0 || entryId.length > 1024) return yield* SessionPageInvalid.make({ sessionId })
      const entry = yield* runtime.sessionEntry({ sessionId, entryId }).pipe(
        Effect.mapError((error) => {
          if (error._tag === "generalist/runtime/SessionEntryNotFound") return SessionPageInvalid.make({ sessionId })
          if (error._tag === "generalist/runtime/SessionEntryCorrupt")
            return RuntimeUnavailable.make({ message: error.message })
          return error
        }),
      )
      const projected = projectEntry(entry)
      return projected === undefined ? yield* SessionPageInvalid.make({ sessionId }) : projected
    }),
})
