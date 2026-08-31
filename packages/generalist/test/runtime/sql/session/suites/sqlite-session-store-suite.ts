import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Runtime, RunStore } from "../../../../../src/runtime/index.js"
import { assistantAddress, textPrompt } from "../../../execution/fixtures.js"
import { sqliteLayer, tempDbPath } from "../../scenario.js"

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const withDb =
  (filename: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Layer.build(sqliteLayer(filename)).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))),
    )

const claimedSession = (sessionId: string, ownerId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const runStore = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId,
      idempotencyKey: `${sessionId}:session-store-contract`,
      prompt: textPrompt("Session store contract"),
    })
    const claim = yield* runStore.claimExecution({ runId: receipt.runId, ownerId })
    const store = Option.getOrThrow(yield* runStore.claimedSessionStore(claim))
    return { runStore, claim, store }
  })

const sessionReader = (sessionId: string) =>
  Effect.gen(function* () {
    const runStore = yield* RunStore.RunStore
    return Option.getOrThrow(yield* runStore.sessionReader(sessionId))
  })

it.live("round-trips undefined fields without colliding with authored Session values", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("session-undefined-codec")
    const sessionId = "sqlite:session-undefined-codec"
    const metadata = {
      oldSentinel: "generalist/runtime/undefined",
      exactMarker: { "generalist/runtime/session-codec": "undefined" },
      escapedMarker: { "generalist/runtime/session-codec": "escaped", value: { nested: true } },
      missing: undefined,
    }

    yield* withDb(filename)(
      Effect.gen(function* () {
        const { store } = yield* claimedSession(sessionId, "undefined-codec")
        yield* store.append({ _tag: "Message", message: user("generalist/runtime/undefined"), metadata })
      }),
    )

    yield* withDb(filename)(
      Effect.gen(function* () {
        const store = yield* sessionReader(sessionId)
        const entry = (yield* store.path())[0]
        expect(entry?._tag).toBe("Message")
        if (entry?._tag !== "Message") return
        expect(entry.message.content[0]).toMatchObject({ text: "generalist/runtime/undefined" })
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
    }

    yield* withDb(filename)(
      Effect.gen(function* () {
        const first = yield* claimedSession(sessionId, "worker-1")
        const store = first.store
        const committed = yield* Deferred.make<void>()
        const append = store.append(entry, options).pipe(
          Effect.tap(() => Deferred.succeed(committed, undefined)),
          Effect.andThen(Effect.never),
        )
        const fiber = yield* Effect.forkChild(append, { startImmediately: true })

        yield* Deferred.await(committed)
        yield* Fiber.interrupt(fiber)
        const replacement = yield* first.runStore.claimExecution({
          runId: first.claim.runId,
          ownerId: "worker-2",
        })
        const replacementStore = Option.getOrThrow(yield* first.runStore.claimedSessionStore(replacement))
        const staleRetry = yield* Effect.flip(store.append(entry, options))
        const retried = yield* replacementStore.append(entry, options)
        const prepared = {
          id: "takeover-checkpoint",
          parentId: retried.id,
          projectedHistory: Prompt.make("takeover checkpoint"),
          telemetry: [],
        }
        expect((yield* replacementStore.appendCheckpoint(prepared))._tag).toBe("Appended")
        const staleCheckpoint = yield* Effect.flip(store.appendCheckpoint(prepared))
        expect(staleCheckpoint).toMatchObject({ message: "Session write claim is stale" })
        expect((yield* replacementStore.appendCheckpoint(prepared))._tag).toBe("AlreadyPresent")
        expect((yield* (yield* sessionReader(sessionId)).path(prepared.id)).map((candidate) => candidate.id)).toEqual([
          options.id,
          prepared.id,
        ])

        const staleReservation = yield* Effect.flip(store.reserveEntryId)
        expect(staleReservation).toMatchObject({ message: "Session write claim is stale" })
        expect(yield* replacementStore.reserveEntryId).toBe("2")

        const staleLeaf = yield* Effect.flip(store.setLeaf(retried.id))
        expect(staleLeaf).toMatchObject({ message: "Session write claim is stale" })
        yield* replacementStore.setLeaf(retried.id)
        const divergentPayload = yield* Effect.flip(
          replacementStore.append({ ...entry, message: user("different digest") }, options),
        )
        const divergentParent = yield* Effect.flip(
          replacementStore.append(entry, { ...options, expectedLeafId: "different-parent" }),
        )

        expect(staleRetry).toMatchObject({ message: "Session write claim is stale" })
        expect(BigInt(replacement.session.epoch)).toBeGreaterThan(BigInt(first.claim.session.epoch))
        expect(retried.id).toBe(options.id)
        expect(divergentPayload._tag).toBe("generalist/core/SessionConflict")
        expect(divergentParent._tag).toBe("generalist/core/SessionConflict")
        if (divergentPayload._tag === "generalist/core/SessionConflict") {
          expect(divergentPayload.reason).toBe("entry-id-reused")
        }
        if (divergentParent._tag === "generalist/core/SessionConflict") {
          expect(divergentParent.reason).toBe("entry-id-reused")
        }
        expect((yield* replacementStore.path()).filter((candidate) => candidate.id === options.id)).toHaveLength(1)
      }),
    )

    const database = new Database(filename)
    expect(
      database
        .query<
          { count: number },
          [string]
        >("SELECT COUNT(*) AS count FROM generalist_session_entries WHERE session_id = ?")
        .get(sessionId),
    ).toEqual({ count: 2 })
    expect(
      database
        .query<{ next_seq: number }, [string]>("SELECT next_seq FROM generalist_sessions WHERE session_id = ?")
        .get(sessionId),
    ).toEqual({ next_seq: 3 })
    database.close()

    yield* withDb(filename)(
      Effect.gen(function* () {
        const { claim, store } = yield* claimedSession(sessionId, "worker-3")
        expect(BigInt(claim.session.epoch)).toBeGreaterThan(2n)
        const reopenedRetry = yield* store.append(entry, options)
        expect(reopenedRetry.id).toBe(options.id)
        expect((yield* store.path()).filter((candidate) => candidate.id === options.id)).toHaveLength(1)

        const next = yield* store.append({ _tag: "Message", message: user("next") })
        expect(next.id).toBe("3")
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
        const { store } = yield* claimedSession("sqlite:stable-session-branch", "branch-worker")
        const entry = { _tag: "Message" as const, message: user("old branch") }
        const options = { id: "logical:model:0:session-entry:0:user", expectedLeafId: null }
        yield* store.append(entry, options)
        yield* store.setLeaf(null)
        yield* store.append(
          { _tag: "Message", message: user("new branch") },
          { id: "logical:model:1:session-entry:0:user", expectedLeafId: null },
        )

        const stale = yield* Effect.flip(store.append(entry, options))

        expect(stale._tag).toBe("generalist/core/SessionConflict")
        if (stale._tag === "generalist/core/SessionConflict") expect(stale.reason).toBe("stale-leaf")
      }),
    )
  }),
)
