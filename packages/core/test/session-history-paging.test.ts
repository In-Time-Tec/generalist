import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Session, SessionHistory } from "../src/index"

/** One isolated in-memory Session per test, built and released in the test's own scope. */
const withSession = <A, E>(effect: Effect.Effect<A, E, Session.SessionStore>): Effect.Effect<A, E> =>
  Effect.scoped(
    Effect.flatMap(Layer.build(Session.layerMemory), (context) => effect.pipe(Effect.provideContext(context))),
  )

const userEntry = (text: string) => ({
  _tag: "Message" as const,
  message: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] }),
})

const seed = (count: number) =>
  Effect.gen(function* () {
    const store = yield* Session.SessionStore
    for (let index = 0; index < count; index += 1) yield* store.append(userEntry(`entry-${index}`))
    return yield* store.path()
  }).pipe(withSession)

const texts = (page: SessionHistory.HistoryPage): ReadonlyArray<string> =>
  page.entries.flatMap((entry) =>
    entry._tag === "Message" && typeof entry.message.content !== "string"
      ? entry.message.content.map((part) => ("text" in part ? part.text : entry._tag))
      : [entry._tag],
  )

describe("SessionHistory.pageHistory", () => {
  it.effect("reads the newest page when no cursor is supplied", () =>
    Effect.gen(function* () {
      const path = yield* seed(10)
      const page = SessionHistory.pageHistory(path, { limit: 3 })
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
        const page: SessionHistory.HistoryPage = SessionHistory.pageHistory(path, {
          limit: 4,
          ...(cursor === undefined ? {} : { before: cursor }),
        })
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
      const page = SessionHistory.pageHistory(path, { limit: 2, after: path[1]!.id })
      expect(page.entries.map((entry) => entry.id)).toEqual([path[2]!.id, path[3]!.id])
      expect(page.hasBefore).toBe(true)
      expect(page.hasAfter).toBe(true)
    }),
  )

  it.effect("returns an empty page for a zero limit and reports both directions", () =>
    Effect.gen(function* () {
      const path = yield* seed(4)
      const page = SessionHistory.pageHistory(path, { limit: 0 })
      expect(page.entries).toEqual([])
      expect(page.firstEntryId).toBeUndefined()
      expect(page.lastEntryId).toBeUndefined()
    }),
  )

  it.effect("bounds a limit larger than the log to the log itself", () =>
    Effect.gen(function* () {
      const path = yield* seed(3)
      const page = SessionHistory.pageHistory(path, { limit: 500 })
      expect(page.entries).toHaveLength(3)
      expect(page.hasBefore).toBe(false)
      expect(page.hasAfter).toBe(false)
    }),
  )

  it.effect("never mutates the path it reads", () =>
    Effect.gen(function* () {
      const path = yield* seed(5)
      const before = path.map((entry) => entry.id)
      SessionHistory.pageHistory(path, { limit: 2 })
      SessionHistory.pageHistory(path, { limit: 2, before: path[3]!.id })
      expect(path.map((entry) => entry.id)).toEqual(before)
    }),
  )
})

describe("Session history behind a compaction checkpoint", () => {
  const compacted = Effect.gen(function* () {
    const store = yield* Session.SessionStore
    yield* store.append(userEntry("pre-1"))
    yield* store.append(userEntry("pre-2"))
    const parentId = yield* store.leaf
    const id = yield* store.reserveEntryId
    yield* store.appendCheckpoint({
      id,
      parentId,
      projectedHistory: Prompt.fromMessages([
        Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "summary" })] }),
      ]),
      telemetry: [],
    })
    yield* store.append(userEntry("post-1"))
    return yield* store.path()
  }).pipe(withSession)

  it.effect("keeps entries recorded before the checkpoint reachable by paging", () =>
    Effect.gen(function* () {
      const path = yield* compacted
      const checkpoint = SessionHistory.compactionCheckpoints(path).at(-1)!
      const page = SessionHistory.pageHistory(path, { limit: 50, before: checkpoint.id })
      expect(texts(page).join(" ")).toContain("pre-1")
      expect(texts(page).join(" ")).toContain("pre-2")
      expect(page.entries.some((entry) => entry._tag === "Compaction")).toBe(false)
    }),
  )

  it.effect("drops pre-checkpoint entries from the model projection but not from the log", () =>
    Effect.gen(function* () {
      const path = yield* compacted
      const projected = Session.buildContext(path).content.flatMap((message) =>
        typeof message.content === "string"
          ? [message.content]
          : message.content.map((part) => ("text" in part ? part.text : "")),
      )
      expect(projected.some((text) => text.includes("pre-1"))).toBe(false)
      expect(projected.some((text) => text.includes("summary"))).toBe(true)
      expect(texts(SessionHistory.pageHistory(path, { limit: 50 })).some((text) => text.includes("pre-1"))).toBe(true)
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
      const page = SessionHistory.pageHistory(path, { limit: 50 })
      expect(page.entries.map((entry) => entry._tag)).toEqual(["Message", "Message", "Compaction", "Message"])
    }),
  )
})
