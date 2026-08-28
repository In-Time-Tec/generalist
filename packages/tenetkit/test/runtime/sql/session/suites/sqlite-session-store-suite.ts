import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { RunStore } from "../../../../../src/runtime/index.js"
import { sqliteLayer, tempDbPath } from "../../scenario.js"

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const withDb =
  (filename: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Layer.build(sqliteLayer(filename)).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))),
    )

const sessionStore = (sessionId: string) =>
  Effect.gen(function* () {
    const runStore = yield* RunStore.RunStore
    return Option.getOrThrow(yield* runStore.sessionStore(sessionId))
  })

it.live("round-trips undefined fields without colliding with authored Session values", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("session-undefined-codec")
    const sessionId = "sqlite:session-undefined-codec"
    const metadata = {
      oldSentinel: "tenetkit/runtime/undefined",
      exactMarker: { "tenetkit/runtime/session-codec": "undefined" },
      escapedMarker: { "tenetkit/runtime/session-codec": "escaped", value: { nested: true } },
      missing: undefined,
    }

    yield* withDb(filename)(
      Effect.gen(function* () {
        const store = yield* sessionStore(sessionId)
        yield* store.append({ _tag: "Message", message: user("tenetkit/runtime/undefined"), metadata })
      }),
    )

    yield* withDb(filename)(
      Effect.gen(function* () {
        const store = yield* sessionStore(sessionId)
        const entry = (yield* store.path())[0]
        expect(entry?._tag).toBe("Message")
        if (entry?._tag !== "Message") return
        expect(entry.message.content[0]).toMatchObject({ text: "tenetkit/runtime/undefined" })
        expect(entry.metadata).toEqual(metadata)
      }),
    )
  }),
)

it.live("retries an ambiguously committed stable Session append across SQLite reopen", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("stable-session-append")
    const sessionId = "sqlite:stable-session-append"
    const entry = {
      _tag: "Message" as const,
      message: user("committed once"),
      metadata: { operation: "model:0", position: 0 },
    }
    const options = {
      id: "logical:model:0:session-entry:0:user",
      expectedLeafId: null,
      ownerToken: "worker-1:1",
    }

    yield* withDb(filename)(
      Effect.gen(function* () {
        const store = yield* sessionStore(sessionId)
        const committed = yield* Deferred.make<void>()
        const append = store.append(entry, options).pipe(
          Effect.tap(() => Deferred.succeed(committed, undefined)),
          Effect.andThen(Effect.never),
        )
        const fiber = yield* Effect.forkChild(append, { startImmediately: true })

        yield* Deferred.await(committed)
        yield* Fiber.interrupt(fiber)
        const retried = yield* store.append(entry, { ...options, ownerToken: "worker-2:2" })
        const divergentPayload = yield* Effect.flip(
          store.append({ ...entry, message: user("different digest") }, options),
        )
        const divergentParent = yield* Effect.flip(
          store.append(entry, { ...options, expectedLeafId: "different-parent" }),
        )

        expect(retried.id).toBe(options.id)
        expect(divergentPayload._tag).toBe("tenetkit/core/SessionConflict")
        expect(divergentParent._tag).toBe("tenetkit/core/SessionConflict")
        if (divergentPayload._tag === "tenetkit/core/SessionConflict") {
          expect(divergentPayload.reason).toBe("entry-id-reused")
        }
        if (divergentParent._tag === "tenetkit/core/SessionConflict") {
          expect(divergentParent.reason).toBe("entry-id-reused")
        }
        expect((yield* store.path()).filter((candidate) => candidate.id === options.id)).toHaveLength(1)
      }),
    )

    const database = new Database(filename)
    expect(
      database
        .query<
          { count: number },
          [string]
        >("SELECT COUNT(*) AS count FROM tenetkit_session_entries WHERE session_id = ?")
        .get(sessionId),
    ).toEqual({ count: 1 })
    expect(
      database
        .query<{ next_seq: number }, [string]>("SELECT next_seq FROM tenetkit_sessions WHERE session_id = ?")
        .get(sessionId),
    ).toEqual({ next_seq: 1 })
    database.close()

    yield* withDb(filename)(
      Effect.gen(function* () {
        const store = yield* sessionStore(sessionId)
        const reopenedRetry = yield* store.append(entry, { ...options, ownerToken: "worker-3:3" })
        expect(reopenedRetry.id).toBe(options.id)
        expect((yield* store.path()).filter((candidate) => candidate.id === options.id)).toHaveLength(1)

        const next = yield* store.append({ _tag: "Message", message: user("next") })
        expect(next.id).toBe("1")
        expect((yield* store.append(entry, options)).id).toBe(options.id)
        expect(yield* store.path()).toHaveLength(2)
      }),
    )
  }),
)

it.live("rejects a stable SQLite append retry after its branch is abandoned", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("stable-session-branch")
    yield* withDb(filename)(
      Effect.gen(function* () {
        const store = yield* sessionStore("sqlite:stable-session-branch")
        const entry = { _tag: "Message" as const, message: user("old branch") }
        const options = { id: "logical:model:0:session-entry:0:user", expectedLeafId: null }
        yield* store.append(entry, options)
        yield* store.setLeaf(null)
        yield* store.append(
          { _tag: "Message", message: user("new branch") },
          { id: "logical:model:1:session-entry:0:user", expectedLeafId: null },
        )

        const stale = yield* Effect.flip(store.append(entry, options))

        expect(stale._tag).toBe("tenetkit/core/SessionConflict")
        if (stale._tag === "tenetkit/core/SessionConflict") expect(stale.reason).toBe("stale-leaf")
      }),
    )
  }),
)
