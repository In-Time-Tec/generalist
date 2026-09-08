import { Effect, Schema, type Types } from "effect"
import { type Entry, SessionStoreError } from "../../../../core/context/session.js"
import { RuntimeUnavailable } from "../../../errors.js"
import {
  ConversationUpdate,
  ConversationEntry,
  projectEntry,
  type Conversation,
} from "../../../session/conversation.js"
import type { HostSessionEvent } from "../../../session/host.js"
import { emptySession, type RuntimeSession, type RuntimeState } from "../../projection.js"
import { SessionReads } from "../../session-reader.js"

export const boundedEntry = (entry: Entry): ConversationEntry | undefined => {
  const projected = projectEntry(entry)
  if (projected === undefined) return undefined
  const bytes = new TextEncoder().encode(
    Schema.encodeSync(Schema.fromJsonString(ConversationEntry))(projected),
  ).byteLength
  return bytes <= 8192
    ? projected
    : { id: projected.id, parentId: projected.parentId, messages: [], contentDeferred: true }
}

export const projectConversation = (input: { readonly sessionId: string; readonly session: RuntimeSession }) =>
  Effect.gen(function* () {
    const page = SessionReads.pathPage(input.session, { leafId: input.session.leaf, limit: 64 })
    if (Schema.is(SessionStoreError)(page)) return yield* RuntimeUnavailable.make({ message: page.message })
    const conversation: Types.Mutable<Conversation> = {
      leafId: input.session.leaf,
      entries: page.entries.flatMap((entry) => {
        const projected = boundedEntry(entry)
        return projected === undefined ? [] : [projected]
      }),
    }
    if (page.nextCursor !== undefined) conversation.nextLeafId = page.nextCursor.entryId
    return conversation
  })

export const publishConversation = (input: {
  readonly previous: RuntimeState
  readonly next: RuntimeState
  readonly sessionId: string
}) =>
  Effect.gen(function* () {
    const host = input.next.hostSessions.get(input.sessionId)
    if (host === undefined) return input.next
    const previous = input.previous.sessions.get(input.sessionId) ?? emptySession()
    const next = input.next.sessions.get(input.sessionId) ?? emptySession()
    if (previous.leaf === next.leaf) return input.next
    const appended = next.leaf === null ? undefined : next.entries.get(next.leaf)
    const before = yield* projectConversation({ sessionId: input.sessionId, session: previous })
    const append =
      appended !== undefined &&
      appended.parentId === previous.leaf &&
      !previous.entries.has(appended.id) &&
      before.entries.length > 0
    const projected = appended === undefined ? undefined : boundedEntry(appended)
    const update: ConversationUpdate = append
      ? {
          previousLeafId: previous.leaf,
          leafId: next.leaf,
          afterEntryId: before.entries.at(-1)?.id ?? null,
          entries: projected === undefined ? [] : [projected],
        }
      : {
          previousLeafId: previous.leaf,
          ...(yield* projectConversation({ sessionId: input.sessionId, session: next })),
          afterEntryId: null,
          reset: true,
        }
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(ConversationUpdate))(update).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    if (new TextEncoder().encode(encoded).byteLength > 1048576)
      return yield* RuntimeUnavailable.make({
        message: "Bounded conversation projection exceeds its encoded byte limit",
      })
    const cursor = host.lastCursor + 1
    const entry: HostSessionEvent = { _tag: "Conversation", cursor, update }
    return {
      ...input.next,
      hostSessions: new Map(input.next.hostSessions).set(input.sessionId, {
        ...host,
        lastCursor: cursor,
        events: [...host.events, entry],
      }),
    }
  }).pipe(
    Effect.mapError((cause) =>
      SessionStoreError.make({
        message: cause.message,
        reason: "corrupt",
        cause,
      }),
    ),
  )
