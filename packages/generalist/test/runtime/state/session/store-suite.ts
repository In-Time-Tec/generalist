import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Scope } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Session } from "../../../../src/index.js"
import { Runtime, RunStore } from "../../../../src/runtime/index.js"
import type { PathPageCursor } from "../../../../src/core/context/session-history.js"
import { make as makeSimulator, type Simulator } from "../../../../src/testing/durability/index.js"
import {
  assistantAddress,
  assistantRef,
  registrationsFor,
  resolverLayer,
  textPrompt,
} from "../../execution/fixtures.js"
import { objectRuntimeLayer, objectWorkerId } from "../../execution/object.js"
import { provideScoped } from "../../execution/scoped-provide.js"
import type { RuntimeServices } from "../../../../src/runtime/state/layer.js"

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const runtimeOptions = {
  addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
  scheduler: { pollInterval: "1 day" as const },
}

const objectLayer = (storage: Simulator) =>
  objectRuntimeLayer(runtimeOptions, storage).pipe(Layer.provide(resolverLayer))

const withObject = <A, E, R extends RuntimeServices | Scope.Scope>(
  storage: Simulator,
  effect: Effect.Effect<A, E, R>,
) => provideScoped(objectLayer(storage), effect)

const claimedSession = (sessionId: string, ownerId: string, claimId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const runStore = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId,
      idempotencyKey: `${sessionId}:session-store-contract`,
      prompt: textPrompt("Session store contract"),
    })
    const claim = yield* runStore.claimExecution({
      commandId: `${sessionId}:claim:${claimId}`,
      runId: receipt.runId,
      ownerId,
    })
    const store = Option.getOrThrow(yield* runStore.claimedSessionStore(claim))
    return { runStore, claim, store }
  })

const sessionReader = (sessionId: string) =>
  Effect.gen(function* () {
    const runStore = yield* RunStore.RunStore
    return Option.getOrThrow(yield* runStore.sessionReader(sessionId))
  })

it.live("round-trips undefined fields without colliding with authored Session values", () => {
  const sessionId = "object:session-undefined-codec"
  const metadata = {
    oldSentinel: "generalist/runtime/undefined",
    exactMarker: { "generalist/runtime/session-codec": "undefined" },
    escapedMarker: { "generalist/runtime/session-codec": "escaped", value: { nested: true } },
    missing: undefined,
  }

  return Effect.gen(function* () {
    const storage = yield* makeSimulator()
    yield* withObject(
      storage,
      Effect.gen(function* () {
        const { store } = yield* claimedSession(sessionId, objectWorkerId, "undefined-codec")
        yield* store.append(
          { _tag: "Message", message: user("generalist/runtime/undefined"), metadata },
          { commandId: "undefined-codec-entry" },
        )
      }),
    )

    yield* withObject(
      storage,
      Effect.gen(function* () {
        const store = yield* sessionReader(sessionId)
        const entry = (yield* store.path())[0]
        expect(entry?._tag).toBe("Message")
        if (entry?._tag !== "Message") return
        expect(entry.message.content[0]).toMatchObject({ text: "generalist/runtime/undefined" })
        expect(entry.metadata).toEqual(metadata)
      }),
    )
  })
})

it.live("retries an ambiguously committed stable Session append across object reopen", () => {
  const sessionId = "object:stable-session-append"
  const entry = {
    _tag: "Message" as const,
    message: user("committed once"),
    metadata: { operation: "model:0", position: 0 },
  }
  const options = {
    id: "logical:model:0:session-entry:0:user",
    expectedLeafId: null,
  }

  return Effect.gen(function* () {
    const storage = yield* makeSimulator()
    let firstClaimEpoch: bigint = 0n
    let originalReceipt: unknown
    yield* withObject(
      storage,
      Effect.gen(function* () {
        const first = yield* claimedSession(sessionId, objectWorkerId, "stable-append:first")
        firstClaimEpoch = BigInt(first.claim.session!.epoch)
        const committed = yield* Deferred.make<void>()
        const append = first.store.append(entry, options).pipe(
          Effect.tap((receipt) =>
            Effect.sync(() => {
              originalReceipt = receipt
            }),
          ),
          Effect.tap(() => Deferred.succeed(committed, undefined)),
          Effect.andThen(Effect.never),
        )
        const fiber = yield* Effect.forkChild(append, { startImmediately: true })

        yield* Deferred.await(committed)
        yield* Fiber.interrupt(fiber)
        yield* first.runStore.releaseExecution(first.claim)
        const replacement = yield* first.runStore.claimExecution({
          commandId: "runtime-state-session-store-suite-claim-worker-2",
          runId: first.claim.runId,
          ownerId: objectWorkerId,
        })
        const replacementStore = Option.getOrThrow(yield* first.runStore.claimedSessionStore(replacement))
        const staleRetry = yield* first.store.append(entry, options)
        const retried = yield* replacementStore.append(entry, options)
        const prepared = {
          id: "takeover-checkpoint",
          parentId: retried.id,
          projectedHistory: Prompt.make("takeover checkpoint"),
          telemetry: [],
        }
        const checkpointReceipt = yield* replacementStore.appendCheckpoint(prepared)
        expect(checkpointReceipt._tag).toBe("Appended")
        expect(yield* replacementStore.appendCheckpoint(prepared)).toEqual(checkpointReceipt)
        const staleCheckpoint = yield* Effect.flip(first.store.appendCheckpoint(prepared))
        expect(staleCheckpoint).toBeInstanceOf(Session.SessionStoreError)
        expect(staleCheckpoint).toMatchObject({ reason: "conflict" })
        yield* first.runStore.releaseExecution(replacement)
        const checkpointClaim = yield* first.runStore.claimExecution({
          commandId: "runtime-state-session-store-suite-claim-checkpoint-presence",
          runId: first.claim.runId,
          ownerId: objectWorkerId,
        })
        const checkpointStore = Option.getOrThrow(yield* first.runStore.claimedSessionStore(checkpointClaim))
        expect(BigInt(checkpointClaim.session!.epoch)).toBeGreaterThan(BigInt(replacement.session!.epoch))
        expect((yield* checkpointStore.appendCheckpoint(prepared))._tag).toBe("AlreadyPresent")
        expect((yield* (yield* sessionReader(sessionId)).path(prepared.id)).map((candidate) => candidate.id)).toEqual([
          options.id,
          prepared.id,
        ])

        const staleReservation = yield* Effect.flip(first.store.reserveEntryId("stale-reservation"))
        expect(staleReservation).toBeInstanceOf(Session.SessionStoreError)
        expect(staleReservation).toMatchObject({ reason: "conflict" })
        const reservation = yield* checkpointStore.reserveEntryId("takeover-reservation")
        expect(reservation).not.toBe(options.id)
        expect(reservation).not.toBe(prepared.id)

        const staleLeaf = yield* Effect.flip(first.store.setLeaf(retried.id, "stale-leaf"))
        expect(staleLeaf).toBeInstanceOf(Session.SessionStoreError)
        expect(staleLeaf).toMatchObject({ reason: "conflict" })
        yield* checkpointStore.setLeaf(retried.id, "takeover-leaf")
        yield* first.runStore.releaseExecution(checkpointClaim)
        const divergentClaim = yield* first.runStore.claimExecution({
          commandId: "runtime-state-session-store-suite-claim-worker-3",
          runId: first.claim.runId,
          ownerId: objectWorkerId,
        })
        const divergentStore = Option.getOrThrow(yield* first.runStore.claimedSessionStore(divergentClaim))
        const divergentPayload = yield* Effect.flip(
          divergentStore.append({ ...entry, message: user("different digest") }, options),
        )
        const divergentParent = yield* Effect.flip(
          divergentStore.append(entry, { ...options, expectedLeafId: "different-parent" }),
        )

        expect(staleRetry).toEqual(originalReceipt)
        expect(BigInt(replacement.session!.epoch)).toBeGreaterThan(firstClaimEpoch)
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

    yield* withObject(
      storage,
      Effect.gen(function* () {
        const { claim, store } = yield* claimedSession(sessionId, objectWorkerId, "stable-append:reopen")
        expect(BigInt(claim.session!.epoch)).toBeGreaterThan(firstClaimEpoch)
        const reopenedRetry = yield* store.append(entry, options)
        expect(reopenedRetry.id).toBe(options.id)
        expect((yield* store.path()).filter((candidate) => candidate.id === options.id)).toHaveLength(1)

        const next = yield* store.append({ _tag: "Message", message: user("next") }, { commandId: "next-entry" })
        expect(next.id).not.toBe(options.id)
        expect((yield* store.append(entry, options)).id).toBe(options.id)
        expect(yield* store.path()).toHaveLength(2)
      }),
    )
  })
})

it.live("rejects a stable object append retry after its branch is abandoned", () => {
  const sessionId = "object:stable-session-branch"

  return Effect.gen(function* () {
    const storage = yield* makeSimulator()
    return yield* withObject(
      storage,
      Effect.gen(function* () {
        const { runStore, claim, store } = yield* claimedSession(sessionId, objectWorkerId, "abandoned-branch:first")
        const entry = { _tag: "Message" as const, message: user("old branch") }
        const options = { id: "logical:model:0:session-entry:0:user", expectedLeafId: null }
        const original = yield* store.append(entry, options)
        yield* store.setLeaf(null, "abandon-old-branch")
        yield* store.append(
          { _tag: "Message", message: user("new branch") },
          { id: "logical:model:1:session-entry:0:user", expectedLeafId: null },
        )
        expect(yield* store.append(entry, options)).toEqual(original)
        yield* runStore.releaseExecution(claim)
        const retryClaim = yield* runStore.claimExecution({
          commandId: "runtime-state-session-store-suite-claim-branch-retry",
          runId: claim.runId,
          ownerId: objectWorkerId,
        })
        const retryStore = Option.getOrThrow(yield* runStore.claimedSessionStore(retryClaim))

        const stale = yield* Effect.flip(retryStore.append(entry, options))

        expect(stale._tag).toBe("generalist/core/SessionConflict")
        if (stale._tag === "generalist/core/SessionConflict") expect(stale.reason).toBe("stale-leaf")
      }),
    )
  })
})

it.live("pages a fixed object leaf across reopen and bounds effective reads at projection boundaries", () => {
  const sessionId = "object:bounded-session-reads"
  let fixedLeaf = ""
  let cursor: PathPageCursor | undefined
  const expectedIds: Array<string> = []

  return Effect.gen(function* () {
    const storage = yield* makeSimulator()
    yield* withObject(
      storage,
      Effect.gen(function* () {
        const { store } = yield* claimedSession(sessionId, objectWorkerId, "bounded-reads:first")
        for (let index = 0; index < 80; index += 1) {
          expectedIds.push(
            (yield* store.append(
              { _tag: "Message", message: user(`cold-${index}`) },
              { commandId: `cold-entry-${index}` },
            )).id,
          )
        }
        const checkpointId = yield* store.reserveEntryId("bounded-checkpoint")
        expectedIds.push(
          (yield* store.appendCheckpoint({
            id: checkpointId,
            parentId: expectedIds.at(-1)!,
            projectedHistory: Prompt.fromMessages([user("bounded projection")]),
            telemetry: [],
          })).checkpoint.id,
        )
        for (let index = 0; index < 20; index += 1) {
          expectedIds.push(
            (yield* store.append(
              { _tag: "Message", message: user(`hot-${index}`) },
              { commandId: `hot-entry-${index}` },
            )).id,
          )
        }
        fixedLeaf = expectedIds.at(-1)!
        const first = yield* store.pathPage({ leafId: fixedLeaf, limit: 7 })
        expect(first.entries).toHaveLength(7)
        expect(first).toMatchObject({ hasOlder: true, hasNewer: false })
        cursor = first.nextCursor
        yield* store.append(
          { _tag: "Message", message: user("later append outside fixed leaf") },
          { commandId: "later-entry" },
        )
      }),
    )

    yield* withObject(
      storage,
      Effect.gen(function* () {
        const reader = yield* sessionReader(sessionId)
        const newest = yield* reader.pathPage({ leafId: fixedLeaf, limit: 7 })
        const paged = [...newest.entries]
        let next = cursor
        while (next !== undefined) {
          const page = yield* reader.pathPage({ leafId: fixedLeaf, cursor: next, limit: 7 })
          paged.unshift(...page.entries)
          next = page.nextCursor
        }
        expect(paged.map((entry) => entry.id)).toEqual(expectedIds)
        expect(paged).toHaveLength(101)
        expect((yield* reader.path()).length).toBe(102)
        const effective = yield* reader.effectivePath(fixedLeaf)
        expect(effective).toHaveLength(21)
        expect(effective[0]?._tag).toBe("Compaction")
        expect(yield* reader.latestCompaction(fixedLeaf)).toEqual(effective[0])
      }),
    )
  })
})

it.live("skips an unreserved numeric checkpoint id for reservations and generated appends", () => {
  const sessionId = "object:unreserved-checkpoint-id"

  return Effect.gen(function* () {
    const storage = yield* makeSimulator()
    yield* withObject(
      storage,
      Effect.gen(function* () {
        const { store } = yield* claimedSession(sessionId, objectWorkerId, "unreserved-checkpoint:first")
        const reserved = yield* store.reserveEntryId("reserve")
        expect(reserved).toBe("0")
        const checkpoint = yield* store.appendCheckpoint({
          id: "1",
          parentId: yield* store.leaf,
          projectedHistory: Prompt.fromMessages([user("projection")]),
          telemetry: [],
        })
        expect(checkpoint._tag).toBe("Appended")
        const reservedAgain = yield* store.reserveEntryId("reserve-again")
        expect(reservedAgain).toBe("2")
        const generated = yield* store.append(
          { _tag: "Message", message: user("generated append") },
          { commandId: "generated-append" },
        )
        expect(generated.id).toBe("3")
        expect((yield* store.entry("1"))?._tag).toBe("Compaction")
      }),
    )

    yield* withObject(
      storage,
      Effect.gen(function* () {
        const reader = yield* sessionReader(sessionId)
        expect((yield* reader.entry("1"))?._tag).toBe("Compaction")
        expect((yield* reader.entry("3"))?._tag).toBe("Message")
        expect((yield* reader.path()).map((entry) => entry.id)).toEqual(["1", "3"])
      }),
    )
  })
})

it.live("skips an offset unreserved numeric checkpoint id for generated appends", () => {
  const sessionId = "object:unreserved-checkpoint-offset"

  return Effect.gen(function* () {
    const storage = yield* makeSimulator()
    yield* withObject(
      storage,
      Effect.gen(function* () {
        const { store } = yield* claimedSession(sessionId, objectWorkerId, "unreserved-offset:first")
        const checkpoint = yield* store.appendCheckpoint({
          id: "4",
          parentId: yield* store.leaf,
          projectedHistory: Prompt.fromMessages([user("offset projection")]),
          telemetry: [],
        })
        expect(checkpoint._tag).toBe("Appended")
        const generatedIds: Array<string> = []
        for (let index = 0; index < 5; index += 1) {
          generatedIds.push(
            (yield* store.append(
              { _tag: "Message", message: user(`generated-${index}`) },
              { commandId: `generated-${index}` },
            )).id,
          )
        }
        expect(generatedIds).not.toContain("4")
        expect(new Set(generatedIds).size).toBe(generatedIds.length)
        const reserved = yield* store.reserveEntryId("offset-reserve")
        expect(generatedIds).not.toContain(reserved)
        expect((yield* store.entry("4"))?._tag).toBe("Compaction")
      }),
    )

    yield* withObject(
      storage,
      Effect.gen(function* () {
        const reader = yield* sessionReader(sessionId)
        expect((yield* reader.entry("4"))?._tag).toBe("Compaction")
        expect(yield* reader.path()).toHaveLength(6)
      }),
    )
  })
})
