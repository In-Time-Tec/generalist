import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { Memory } from "../../src/index.js"
import { VectorStore } from "../../src/memory/index"

const key: Memory.Key = { agent: "agent-a", subject: "subject-a" }
const otherSubject: Memory.Key = { agent: "agent-a", subject: "subject-b" }
const otherAgent: Memory.Key = { agent: "agent-b", subject: "subject-a" }

const document = (
  id: string,
  memoryKey: Memory.Key,
  text: string,
  embedding: ReadonlyArray<number>,
): VectorStore.Embedded => ({
  id,
  key: memoryKey,
  text,
  embedding,
  version: 1,
  evidence: [],
  appliedAt: "2030-01-01T00:00:00.000Z",
})

layer(VectorStore.layerMemory)("VectorStore", (it) => {
  it.effect("ranks matching-key documents by cosine score", () =>
    Effect.gen(function* () {
      const store = yield* VectorStore.VectorStore
      yield* store.delete({ key })
      yield* store.delete({ key: otherSubject })
      yield* store.delete({ key: otherAgent })

      yield* store.upsert([
        document("near", key, "near", [1, 0]),
        document("far", key, "far", [0, 1]),
        document("also-near", key, "also-near", [0.8, 0.2]),
      ])

      const matches = yield* store.query({ key, embedding: [1, 0], limit: 2 })

      expect(matches.map((match) => match.document.text)).toEqual(["near", "also-near"])
      expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 0)
    }),
  )

  it.effect("enforces exact agent and subject key isolation", () =>
    Effect.gen(function* () {
      const store = yield* VectorStore.VectorStore
      yield* store.delete({ key })
      yield* store.delete({ key: otherSubject })
      yield* store.delete({ key: otherAgent })

      yield* store.upsert([
        document("primary-id", key, "visible", [1, 0]),
        document("other-subject-id", otherSubject, "other subject", [1, 0]),
        document("other-agent-id", otherAgent, "other agent", [1, 0]),
      ])

      const matches = yield* store.query({ key, embedding: [1, 0], limit: 10 })

      expect(matches.map((match) => match.document.text)).toEqual(["visible"])
    }),
  )

  it.effect("applies limit and minScore", () =>
    Effect.gen(function* () {
      const store = yield* VectorStore.VectorStore
      yield* store.delete({ key })

      yield* store.upsert([
        document("limited-near", key, "near", [1, 0]),
        document("limited-also-near", key, "also-near", [0.8, 0.2]),
      ])

      const limited = yield* store.query({ key, embedding: [1, 0], limit: 1 })
      const thresholded = yield* store.query({ key, embedding: [1, 0], limit: 10, minScore: 0.99 })

      expect(limited.map((match) => match.document.text)).toEqual(["near"])
      expect(thresholded.map((match) => match.document.text)).toEqual(["near"])
    }),
  )

  it.effect("fails loudly on matching-key dimension mismatch", () =>
    Effect.gen(function* () {
      const store = yield* VectorStore.VectorStore
      yield* store.delete({ key })

      yield* store.upsert([document("bad", key, "bad", [1, 0, 0])])

      const failure = yield* Effect.flip(store.query({ key, embedding: [1, 0], limit: 1 }))

      expect(failure._tag).toBe("generalist/memory/VectorStoreError")
      expect(failure.message).toContain("dimension")
    }),
  )

  it.effect("deletes documents for the exact memory key", () =>
    Effect.gen(function* () {
      const store = yield* VectorStore.VectorStore
      yield* store.delete({ key })
      yield* store.delete({ key: otherSubject })

      yield* store.upsert([
        document("primary-delete-id", key, "visible", [1, 0]),
        document("other-delete-id", otherSubject, "other subject", [1, 0]),
      ])

      yield* store.delete({ key })

      const deletedMatches = yield* store.query({ key, embedding: [1, 0], limit: 10 })
      const remainingMatches = yield* store.query({ key: otherSubject, embedding: [1, 0], limit: 10 })

      expect(deletedMatches).toEqual([])
      expect(remainingMatches.map((match) => match.document.text)).toEqual(["other subject"])
    }),
  )

  it.effect("deletes one document id within the exact memory key", () =>
    Effect.gen(function* () {
      const store = yield* VectorStore.VectorStore
      yield* store.delete({ key })
      yield* store.delete({ key: otherSubject })

      yield* store.upsert([
        document("first", key, "first", [1, 0]),
        document("second", key, "second", [0, 1]),
        document("other-first", otherSubject, "other subject", [1, 0]),
      ])

      yield* store.delete({ key, id: "first" })

      const deletedKeyMatches = yield* store.query({ key, embedding: [1, 0], limit: 10 })
      const otherSubjectMatches = yield* store.query({ key: otherSubject, embedding: [1, 0], limit: 10 })

      expect(deletedKeyMatches.map((match) => match.document.text)).toEqual(["second"])
      expect(otherSubjectMatches.map((match) => match.document.text)).toEqual(["other subject"])
    }),
  )

  it.effect("retains the current version pointer while an entry is forgotten", () =>
    Effect.gen(function* () {
      const store = yield* VectorStore.VectorStore
      const first = document("forgotten-version", key, "first", [1, 0])
      const second = { ...first, text: "second", version: 2, supersedes: 1, appliedAt: "2030-01-02T00:00:00.000Z" }
      yield* store.upsert([first, second])
      yield* store.delete({ key, id: first.id })

      const stale = { ...second, text: "stale", version: 3, supersedes: 1, appliedAt: "2030-01-03T00:00:00.000Z" }
      const failure = yield* Effect.flip(store.upsert([stale]))
      expect(failure.message).toContain("does not have active version 1")

      const replacement = { ...stale, text: "replacement", supersedes: 2 }
      yield* store.upsert([replacement])
      const matches = yield* store.query({ key, embedding: [1, 0], limit: 10 })
      expect(matches.some((match) => match.document.text === "replacement")).toBe(true)
      expect(yield* store.history(first.id)).toHaveLength(3)
    }),
  )
})
