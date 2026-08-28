import { Effect, Option, Schema } from "effect"
import { SessionStore, type Entry } from "../../context/session.js"
import { AgentError } from "../event.js"

export const SessionCursor = Schema.Struct({ leafId: Schema.NullOr(Schema.String) })
export type SessionCursor = typeof SessionCursor.Type

export const cursorFromPath = (path: ReadonlyArray<Entry>): SessionCursor => ({ leafId: path.at(-1)?.id ?? null })

export const pathFromCursor = (input: {
  readonly turn: number
  readonly cursor: unknown
  readonly session: Option.Option<typeof SessionStore.Service>
  readonly sessionError: (turn: number, error: import("../../context/session.js").SessionStoreError) => AgentError
}): Effect.Effect<ReadonlyArray<Entry>, AgentError> =>
  Schema.decodeUnknownEffect(SessionCursor)(input.cursor).pipe(
    Effect.mapError((error) =>
      AgentError.make({ message: `Invalid Session cursor: ${String(error)}`, turn: input.turn, cause: error }),
    ),
    Effect.flatMap((decoded) =>
      Option.match(input.session, {
        onNone: () => Effect.succeed([]),
        onSome: (session) =>
          decoded.leafId === null
            ? Effect.succeed([])
            : session.path(decoded.leafId).pipe(Effect.mapError((error) => input.sessionError(input.turn, error))),
      }),
    ),
  )
