import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Entry, MessageEntry } from "../../../../../src/core/context/session.js"
import {
  emptySession,
  emptyState,
  type RuntimeSession,
  type RuntimeState,
} from "../../../../../src/runtime/state/projection.js"
import {
  projectConversation,
  publishConversation,
} from "../../../../../src/runtime/state/store/host-session/conversation.js"

const user = (id: string, parentId: string | null): MessageEntry => ({
  id,
  parentId,
  _tag: "Message",
  message: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: id })] }),
})
const session = (entries: ReadonlyArray<Entry>): RuntimeSession => ({
  ...emptySession(),
  entries: new Map(entries.map((entry) => [entry.id, entry])),
  order: entries.map((entry) => entry.id),
  leaf: entries.at(-1)?.id ?? null,
  counter: entries.length,
})
const state = (conversation: RuntimeSession): RuntimeState => ({
  ...emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 16 }),
  sessions: new Map([["session-1", conversation]]),
  hostSessions: new Map([
    [
      "session-1",
      {
        session: { id: "session-1", createdAt: "2026-09-02T00:00:00.000Z" },
        lastCursor: -1,
        events: [],
        subscribers: new Map(),
      },
    ],
  ]),
})

it.effect("rejects an oversized active path instead of returning a truncated conversation", () =>
  Effect.gen(function* () {
    const entries = Array.from({ length: 8193 }, (_, index) =>
      user(String(index), index === 0 ? null : String(index - 1)),
    )
    expect(
      yield* projectConversation({ sessionId: "session-1", session: session(entries) }).pipe(Effect.flip),
    ).toMatchObject({ _tag: "generalist/host/SessionSnapshotTooLarge", limit: "entries", maximum: 8192 })
    expect(entries).toHaveLength(8193)
  }),
)

it.effect("publishes only an appended suffix and retains original parent and leaf identities", () =>
  Effect.gen(function* () {
    const first = user("first", null)
    const second = user("second", "first")
    const previous = state(session([first]))
    const next = { ...previous, sessions: new Map([["session-1", session([first, second])]]) }
    const published = yield* publishConversation({ previous, next, sessionId: "session-1" })
    expect(published.runs).toBe(previous.runs)
    expect(published.hostSessions.get("session-1")?.events).toEqual([
      {
        _tag: "Conversation",
        cursor: 0,
        update: {
          previousLeafId: "first",
          leafId: "second",
          afterEntryId: "first",
          entries: [{ id: "second", parentId: "first", messages: [second.message] }],
        },
      },
    ])
    expect(yield* publishConversation({ previous: published, next: published, sessionId: "session-1" })).toBe(published)
  }),
)

it.effect("rejects an oversized conversation update with its typed cause before changing Host state", () =>
  Effect.gen(function* () {
    const entry: Entry = {
      id: "large",
      parentId: null,
      _tag: "Message",
      message: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "x".repeat(1048576) })] }),
    }
    const previous = state(emptySession())
    const next = { ...previous, sessions: new Map([["session-1", session([entry])]]) }
    expect(yield* publishConversation({ previous, next, sessionId: "session-1" }).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/core/SessionStoreError",
      reason: "unsupported",
      cause: { _tag: "generalist/host/SessionSnapshotTooLarge", limit: "bytes" },
    })
    expect(previous.hostSessions.get("session-1")?.lastCursor).toBe(-1)
    expect(previous.sessions.get("session-1")?.entries.size).toBe(0)
  }),
)
