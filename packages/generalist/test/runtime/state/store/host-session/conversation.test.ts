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
import { historyPage } from "../../../../../src/runtime/state/store/host-session/page.js"
import { SessionReads } from "../../../../../src/runtime/state/session-reader.js"

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
        session: { id: "session-1", createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
        lastCursor: -1,
        events: [],
        subscribers: new Map(),
      },
    ],
  ]),
})

it("reads no more native entries than the requested page limit", () => {
  let reads = 0
  class CountedEntries extends Map<string, Entry> {
    override get(id: string) {
      reads++
      return super.get(id)
    }
  }
  const entries = Array.from({ length: 65 }, (_, index) => user(String(index), index === 0 ? null : String(index - 1)))
  const stored = { ...session(entries), entries: new CountedEntries(entries.map((entry) => [entry.id, entry])) }
  const page = SessionReads.pathPage(stored, { leafId: "64", limit: 64 })
  expect(reads).toBe(64)
  expect(page).toMatchObject({ hasOlder: true, nextCursor: { leafId: "64", entryId: "0" } })
  reads = 0
  expect(SessionReads.pathPage(stored, { leafId: "0", limit: 64 })).toMatchObject({
    entries: [entries[0]],
    hasOlder: false,
  })
  expect(reads).toBe(1)
})

it.effect("pages an active path beyond the former entry limit without losing canonical entries", () =>
  Effect.gen(function* () {
    const entries = Array.from({ length: 8193 }, (_, index) =>
      user(String(index), index === 0 ? null : String(index - 1)),
    )
    const stored = session(entries)
    const projection = yield* projectConversation({ sessionId: "session-1", session: stored })
    expect(projection.entries).toHaveLength(64)
    const ids = projection.entries.map((entry) => entry.id)
    let leafId: string | null = projection.nextLeafId ?? null
    while (leafId !== null) {
      const page = yield* historyPage({ state: state(stored), sessionId: "session-1", input: { leafId, limit: 64 } })
      ids.unshift(...page.entries.map((entry) => entry.id))
      leafId = page.nextLeafId
    }
    expect(ids).toEqual(entries.map((entry) => entry.id))
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

it.effect("publishes an immutable deferred reference instead of rejecting large committed content", () =>
  Effect.gen(function* () {
    const entry: Entry = {
      id: "large",
      parentId: null,
      _tag: "Message",
      message: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "x".repeat(1048576) })] }),
    }
    const previous = state(emptySession())
    const next = { ...previous, sessions: new Map([["session-1", session([entry])]]) }
    const published = yield* publishConversation({ previous, next, sessionId: "session-1" })
    expect(published.hostSessions.get("session-1")?.events[0]).toMatchObject({
      _tag: "Conversation",
      update: { entries: [{ id: "large", messages: [], contentDeferred: true }] },
    })
    expect(published.sessions.get("session-1")?.entries.get("large")).toEqual(entry)
    expect(previous.hostSessions.get("session-1")?.lastCursor).toBe(-1)
    expect(previous.sessions.get("session-1")?.entries.size).toBe(0)
  }),
)

it.effect("rejects invalid and cross-Session leaf selectors before traversing history", () =>
  Effect.gen(function* () {
    const stored = state(session([user("known", null)]))
    for (const input of [
      { leafId: "known", limit: 65 },
      { leafId: "known", limit: 0 },
      { leafId: "unknown", limit: 1 },
      { leafId: "x".repeat(1025), limit: 1 },
    ]) {
      expect(yield* historyPage({ state: stored, sessionId: "session-1", input }).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/host/SessionPageInvalid",
      })
    }
  }),
)
