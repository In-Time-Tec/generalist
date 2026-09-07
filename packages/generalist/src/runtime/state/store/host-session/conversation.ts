import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { type Entry, SessionStoreError } from "../../../../core/context/session.js"
import { promptFromResponseParts } from "../../../../media/prompt.js"
import { RuntimeUnavailable } from "../../../errors.js"
import { ConversationUpdate, type ConversationEntry } from "../../../session/conversation.js"
import { type HostSessionEvent, SessionSnapshotTooLarge } from "../../../session/host.js"
import { emptySession, type RuntimeSession, type RuntimeState } from "../../projection.js"
import { SessionReads } from "../../session-reader.js"

const visible = (entry: Entry): ConversationEntry | undefined => {
  let messages: ReadonlyArray<Prompt.Message>
  switch (entry._tag) {
    case "Message":
    case "Steering":
      messages = [entry.message]
      break
    case "ModelResponse":
      messages = promptFromResponseParts(entry.content).content
      break
    case "Handoff":
      messages = entry.projectedHistory.content
      break
    case "ToolCall":
      messages = [Prompt.makeMessage("assistant", { content: [entry.part] })]
      break
    case "ToolResult":
      messages = [Prompt.makeMessage("tool", { content: [entry.part] })]
      break
    default:
      return undefined
  }
  const content = messages.filter(
    (message): message is Exclude<Prompt.Message, { readonly role: "system" }> => message.role !== "system",
  )
  return content.length === 0 ? undefined : { id: entry.id, parentId: entry.parentId, messages: content }
}

const excess = (sessionId: string) => SessionSnapshotTooLarge.make({ sessionId, limit: "entries", maximum: 8192 })

const previousVisibleId = (sessionId: string, session: RuntimeSession) =>
  Effect.gen(function* () {
    let cursor = session.leaf
    let scanned = 0
    while (cursor !== null) {
      if (++scanned > 8192) return yield* excess(sessionId)
      const entry = session.entries.get(cursor)
      if (entry === undefined)
        return yield* RuntimeUnavailable.make({ message: `Session entry ${cursor} does not exist` })
      if (visible(entry) !== undefined) return entry.id
      cursor = entry.parentId
    }
    return null
  })

export const projectConversation = (input: { readonly sessionId: string; readonly session: RuntimeSession }) =>
  Effect.gen(function* () {
    const page = SessionReads.pathPage(input.session, { leafId: input.session.leaf, limit: 8192 })
    if (Schema.is(SessionStoreError)(page)) return yield* RuntimeUnavailable.make({ message: page.message })
    if (page.hasOlder) return yield* excess(input.sessionId)
    return {
      leafId: input.session.leaf,
      entries: page.entries.flatMap((entry) => {
        const projected = visible(entry)
        return projected === undefined ? [] : [projected]
      }),
    }
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
    let afterEntryId: string | null = null
    let entries: ReadonlyArray<ConversationEntry>
    if (appended !== undefined && appended.parentId === previous.leaf && !previous.entries.has(appended.id)) {
      afterEntryId = yield* previousVisibleId(input.sessionId, previous)
      const entry = visible(appended)
      entries = entry === undefined ? [] : [entry]
    } else {
      const before = yield* projectConversation({ sessionId: input.sessionId, session: previous })
      const after = yield* projectConversation({ sessionId: input.sessionId, session: next })
      const mismatch = before.entries.findIndex((entry, index) => entry.id !== after.entries[index]?.id)
      const common = mismatch < 0 ? before.entries.length : mismatch
      afterEntryId = common === 0 ? null : before.entries[common - 1]!.id
      entries = after.entries.slice(common)
    }
    const update = { previousLeafId: previous.leaf, leafId: next.leaf, afterEntryId, entries }
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(ConversationUpdate))(update).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    if (new TextEncoder().encode(encoded).byteLength > 1048576)
      return yield* SessionSnapshotTooLarge.make({ sessionId: input.sessionId, limit: "bytes", maximum: 1048576 })
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
        reason: Schema.is(SessionSnapshotTooLarge)(cause) ? "unsupported" : "corrupt",
        cause,
      }),
    ),
  )
