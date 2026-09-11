import { layerMemory } from "../../../src/core/context/session-memory.js"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Session, SessionHistory } from "../../../src/index"

/** One isolated in-memory Session per test, built and released in the test's own scope. */
const withSession = <A, E>(effect: Effect.Effect<A, E, Session.SessionDirectory>): Effect.Effect<A, E> =>
  Effect.scoped(Effect.flatMap(Layer.build(layerMemory), (context) => effect.pipe(Effect.provideContext(context))))

const userEntry = (text: string) => ({
  _tag: "Message" as const,
  message: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] }),
})

const seed = (count: number) =>
  withSession(
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* Session.acquire("history-test")
        for (let index = 0; index < count; index += 1)
          yield* store.append(userEntry(`entry-${index}`), { commandId: `fixture-23-${index}` })
        return yield* store.path()
      }),
    ),
  )

const texts = (page: SessionHistory.HistoryPage): ReadonlyArray<string> =>
  page.entries.flatMap((entry) =>
    entry._tag === "Message" && !Schema.is(Schema.String)(entry.message.content)
      ? entry.message.content.map((part) => ("text" in part ? part.text : entry._tag))
      : [entry._tag],
  )

describe("SessionHistory.page", () => {
  it.effect("reads the newest page when no cursor is supplied", () =>
    Effect.gen(function* () {
      const path = yield* seed(10)
      const page = SessionHistory.page(path, { limit: 3 })
      expect(page.entries).toHaveLength(3)
      expect(page.entries.map((entry) => entry.id)).toEqual(path.slice(7).map((entry) => entry.id))
      expect(page.hasBefore).toBe(true)
      expect(page.hasAfter).toBe(false)
    }),
  )

  it.effect("walks backwards through the whole log without gaps or repeats", () =>
    Effect.gen(function* () {
      const path = yield* seed(10)
      const collected: Array<string> = []
      let cursor: string | undefined = undefined
      for (let guard = 0; guard < 10; guard += 1) {
        const page: SessionHistory.HistoryPage =
          cursor === undefined
            ? SessionHistory.page(path, { limit: 4 })
            : SessionHistory.page(path, { limit: 4, before: cursor })
        collected.unshift(...page.entries.map((entry) => entry.id))
        if (!page.hasBefore) break
        cursor = page.firstEntryId
      }
      expect(collected).toEqual(path.map((entry) => entry.id))
    }),
  )

  it.effect("reads forwards from an after cursor", () =>
    Effect.gen(function* () {
      const path = yield* seed(6)
      const page = SessionHistory.page(path, { limit: 2, after: path[1]!.id })
      expect(page.entries.map((entry) => entry.id)).toEqual([path[2]!.id, path[3]!.id])
      expect(page.hasBefore).toBe(true)
      expect(page.hasAfter).toBe(true)
    }),
  )

  it.effect("returns an empty page for a zero limit and reports both directions", () =>
    Effect.gen(function* () {
      const path = yield* seed(4)
      const page = SessionHistory.page(path, { limit: 0 })
      expect(page.entries).toEqual([])
      expect(page.firstEntryId).toBeUndefined()
      expect(page.lastEntryId).toBeUndefined()
    }),
  )

  it.effect("reads the newest page when a cursor names no entry it holds", () =>
    withSession(
      Effect.scoped(
        Effect.gen(function* () {
          // A cursor is a caller's string, so one that matches nothing still selects a window. The
          // window is the newest page, which is exactly what a caller asking for entries BEFORE
          // something must not mistake for an answer, so the page names the cursor it could not use.
          const store = yield* Session.acquire("unknown-cursor")
          for (const [index, text] of ["a", "b", "c"].entries())
            yield* store.append(userEntry(text), { commandId: `history-${index}` })
          const path = yield* store.path()
          const page = SessionHistory.page(path, { limit: 2, before: "no-such-entry" })
          expect(page.entries.map((entry) => entry.id)).toEqual(path.slice(-2).map((entry) => entry.id))
          expect(page.unknownCursors).toEqual(["no-such-entry"])
          expect(SessionHistory.page(path, { limit: 2 }).unknownCursors).toBeUndefined()
          expect(page.hasAfter).toBe(false)
        }),
      ),
    ),
  )

  it.effect("bounds a limit larger than the log to the log itself", () =>
    Effect.gen(function* () {
      const path = yield* seed(3)
      const page = SessionHistory.page(path, { limit: 500 })
      expect(page.entries).toHaveLength(3)
      expect(page.hasBefore).toBe(false)
      expect(page.hasAfter).toBe(false)
    }),
  )

  it.effect("never mutates the path it reads", () =>
    Effect.gen(function* () {
      const path = yield* seed(5)
      const before = path.map((entry) => entry.id)
      SessionHistory.page(path, { limit: 2 })
      SessionHistory.page(path, { limit: 2, before: path[3]!.id })
      expect(path.map((entry) => entry.id)).toEqual(before)
    }),
  )
})

describe("SessionHistory.page with a non-finite limit", () => {
  const entry = (id: string): Session.Entry => ({
    _tag: "Message",
    id,
    parentId: null,
    message: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: id })] }),
  })
  const path = ["e0", "e1", "e2", "e3", "e4", "e5"].map(entry)

  const clampedLimits = [Number.NaN, Number.NEGATIVE_INFINITY]
  const cursors: ReadonlyArray<Pick<SessionHistory.HistoryPageInput, "before" | "after">> = [
    {},
    { before: "e0" },
    { before: "e3" },
    { before: "e5" },
    { after: "e0" },
    { after: "e2" },
    { after: "e5" },
    { before: "e5", after: "e0" },
    { before: "e3", after: "e2" },
    { before: "e0", after: "e5" },
    { before: "missing" },
    { after: "missing" },
    { before: "missing", after: "missing" },
  ]

  it("treats NaN and negative infinity as the documented zero clamp for every cursor", () => {
    for (const limit of clampedLimits) {
      for (const cursor of cursors) {
        const input = { limit, ...cursor }
        expect(SessionHistory.page(path, input)).toEqual(SessionHistory.page(path, { ...input, limit: 0 }))
      }
    }
  })

  it("pins the empty page a NaN limit returns for the whole log", () => {
    const page = SessionHistory.page(path, { limit: Number.NaN })
    expect(page.entries).toEqual([])
    expect(page.firstEntryId).toBeUndefined()
    expect(page.lastEntryId).toBeUndefined()
    expect(page.hasBefore).toBe(true)
    expect(page.hasAfter).toBe(false)
  })

  it("reports continuation flags that match the entries a NaN limit returns", () => {
    const older = SessionHistory.page(path, { limit: Number.NaN, before: "e3" })
    expect(older.entries).toEqual([])
    expect(older.firstEntryId).toBeUndefined()
    expect(older.lastEntryId).toBeUndefined()
    expect(older.hasBefore).toBe(true)
    expect(older.hasAfter).toBe(true)

    const newer = SessionHistory.page(path, { limit: Number.NaN, after: "e2" })
    expect(newer.entries).toEqual([])
    expect(newer.hasBefore).toBe(true)
    expect(newer.hasAfter).toBe(true)
  })

  it("clamps a non-finite limit on empty and single-entry paths", () => {
    const candidates: ReadonlyArray<ReadonlyArray<Session.Entry>> = [[], path.slice(0, 1)]
    for (const candidate of candidates) {
      for (const limit of clampedLimits) {
        for (const cursor of [{}, { before: "e0" }, { after: "e0" }]) {
          const input = { limit, ...cursor }
          expect(SessionHistory.page(candidate, input)).toEqual(SessionHistory.page(candidate, { ...input, limit: 0 }))
        }
      }
    }
  })

  it("reads the whole selected window for positive infinity", () => {
    const newest = SessionHistory.page(path, { limit: Number.POSITIVE_INFINITY })
    expect(newest.entries.map((value) => value.id)).toEqual(path.map((value) => value.id))
    expect(newest.hasBefore).toBe(false)
    expect(newest.hasAfter).toBe(false)

    const older = SessionHistory.page(path, { limit: Number.POSITIVE_INFINITY, before: "e3" })
    expect(older.entries.map((value) => value.id)).toEqual(["e0", "e1", "e2"])
    expect(older.hasBefore).toBe(false)
    expect(older.hasAfter).toBe(true)

    const newer = SessionHistory.page(path, { limit: Number.POSITIVE_INFINITY, after: "e2" })
    expect(newer.entries.map((value) => value.id)).toEqual(["e3", "e4", "e5"])
    expect(newer.hasBefore).toBe(true)
    expect(newer.hasAfter).toBe(false)
  })
})

describe("Session history behind a compaction checkpoint", () => {
  const compacted = withSession(
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* Session.acquire("compacted-history")
        yield* store.append(userEntry("pre-1"), { commandId: "fixture-132" })
        yield* store.append(userEntry("pre-2"), { commandId: "fixture-133" })
        const parentId = yield* store.leaf
        const id = yield* store.reserveEntryId("history-checkpoint")
        yield* store.appendCheckpoint({
          id,
          parentId,
          projectedHistory: Prompt.fromMessages([
            Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "summary" })] }),
          ]),
          telemetry: [],
        })
        yield* store.append(userEntry("post-1"), { commandId: "fixture-144" })
        return yield* store.path()
      }),
    ),
  )

  it.effect("keeps entries recorded before the checkpoint reachable by paging", () =>
    Effect.gen(function* () {
      const path = yield* compacted
      const checkpoint = SessionHistory.compactionCheckpoints(path).at(-1)!
      const page = SessionHistory.page(path, { limit: 50, before: checkpoint.id })
      expect(texts(page).join(" ")).toContain("pre-1")
      expect(texts(page).join(" ")).toContain("pre-2")
      expect(page.entries.some((entry) => entry._tag === "Compaction")).toBe(false)
    }),
  )

  it.effect("drops pre-checkpoint entries from the model projection but not from the log", () =>
    Effect.gen(function* () {
      const path = yield* compacted
      const projected = Session.buildContext(path).content.flatMap((message) =>
        Schema.is(Schema.String)(message.content)
          ? [message.content]
          : message.content.map((part) => ("text" in part ? part.text : "")),
      )
      expect(projected.some((text) => text.includes("pre-1"))).toBe(false)
      expect(projected.some((text) => text.includes("summary"))).toBe(true)
      expect(texts(SessionHistory.page(path, { limit: 50 })).some((text) => text.includes("pre-1"))).toBe(true)
    }),
  )

  it.effect("lists every compaction checkpoint on the path", () =>
    Effect.gen(function* () {
      const path = yield* compacted
      const checkpoints = SessionHistory.compactionCheckpoints(path)
      expect(checkpoints).toHaveLength(1)
      expect(checkpoints[0]!._tag).toBe("Compaction")
    }),
  )

  it.effect("treats the checkpoint as an ordinary entry in the full page", () =>
    Effect.gen(function* () {
      const path = yield* compacted
      const page = SessionHistory.page(path, { limit: 50 })
      expect(page.entries.map((entry) => entry._tag)).toEqual(["Message", "Message", "Compaction", "Message"])
    }),
  )
})
