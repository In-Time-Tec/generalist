import { expect, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { KernelResourceStore, TestKernel } from "../../src/repl/index.js"

const request = (ownerId: string) => ({
  sessionId: "session",
  ownerId,
  provider: "hosted",
  profileDigest: "profile-v1",
  leaseMillis: 60_000,
})

const binding = {
  provider: "hosted",
  resourceId: "resource-1",
  profileDigest: "profile-v1",
  epoch: 0,
  state: "live",
  checkpoint: "restart-only",
} as const

it.effect("serializes acquisition and lets only the new generation reconcile an admitted prior cell", () =>
  Effect.gen(function* () {
    const store = yield* TestKernel.makeMemoryResourceStore
    const [left, right] = yield* Effect.all(
      [Effect.exit(store.acquire(request("host-a"))), Effect.exit(store.acquire(request("host-b")))],
      { concurrency: "unbounded" },
    )
    expect([left, right].filter(Exit.isSuccess)).toHaveLength(1)
    let first
    if (Exit.isSuccess(left)) first = left.value
    else if (Exit.isSuccess(right)) first = right.value
    expect(first).toBeDefined()
    if (first === undefined) return

    yield* store.bind({ claim: first.claim, resource: binding })
    const admitted = { ...first.claim, epoch: 0, profileDigest: "profile-v1", cellId: "active" }
    yield* store.admit({ command: admitted, kind: "cell" })
    yield* store.expire("session")

    const nextOwner = first.claim.ownerId === "host-a" ? "host-b" : "host-a"
    const takeover = yield* store.acquire(request(nextOwner))
    expect(takeover.claim.generation).toBe(2)
    expect(takeover.resource?.activeCell).toEqual(admitted)
    const control = { ...takeover.claim, epoch: 0, profileDigest: "profile-v1", cellId: "control" }
    yield* store.admit({ command: control, kind: "control", expectedCell: admitted })
    yield* store.finish({ claim: takeover.claim, expectedCell: admitted })
    expect((yield* store.inspect("session"))?.resource?.activeCell).toBeUndefined()

    const stale = yield* store.renew(first.claim, 60_000).pipe(Effect.flip)
    expect(Schema.is(KernelResourceStore.KernelResourceRejected)(stale)).toBe(true)
    if (Schema.is(KernelResourceStore.KernelResourceRejected)(stale)) expect(stale.reason).toBe("stale-claim")

    const changedProfile = yield* store.acquire({ ...request(nextOwner), profileDigest: "profile-v2" })
    const outdated = yield* store
      .admit({
        command: { ...changedProfile.claim, epoch: 0, profileDigest: "profile-v1", cellId: "outdated" },
        kind: "control",
      })
      .pipe(Effect.flip)
    expect(Schema.is(KernelResourceStore.KernelResourceRejected)(outdated)).toBe(true)
    if (Schema.is(KernelResourceStore.KernelResourceRejected)(outdated)) {
      expect(outdated.reason).toBe("resource-mismatch")
    }
  }),
)

it.effect("prevents active pause and retains failed deletion until exact cleanup succeeds", () =>
  Effect.gen(function* () {
    const store = yield* TestKernel.makeMemoryResourceStore
    const lease = yield* store.acquire(request("host-a"))
    yield* store.bind({ claim: lease.claim, resource: binding })
    const cell = { ...lease.claim, epoch: 0, profileDigest: "profile-v1", cellId: "active" }
    yield* store.admit({ command: cell, kind: "cell" })
    const pauseFailure = yield* store
      .bind({ claim: lease.claim, resource: { ...binding, state: "paused", checkpoint: "live-process" } })
      .pipe(Effect.flip)
    expect(Schema.is(KernelResourceStore.KernelResourceRejected)(pauseFailure)).toBe(true)
    if (Schema.is(KernelResourceStore.KernelResourceRejected)(pauseFailure)) {
      expect(pauseFailure.reason).toBe("cell-active")
    }

    yield* store.finish({ claim: lease.claim, expectedCell: cell })
    yield* store.bind({ claim: lease.claim, resource: { ...binding, state: "paused", checkpoint: "live-process" } })
    const deleting = yield* store.revoke(lease.claim)
    expect(deleting).toBeDefined()
    if (deleting === undefined) return
    yield* store.failDeletion({ claim: lease.claim, expectedResource: deleting }, "provider timeout")
    expect((yield* store.pendingDeletion)[0]?.resource).toMatchObject({
      resourceId: "resource-1",
      state: "deleting",
      cleanupFailure: { attempts: 1, message: "provider timeout" },
    })

    const wrong = yield* store
      .confirmDeletion({ claim: lease.claim, expectedResource: { ...deleting, resourceId: "resource-2" } })
      .pipe(Effect.flip)
    expect(Schema.is(KernelResourceStore.KernelResourceRejected)(wrong)).toBe(true)
    expect((yield* store.inspect("session"))?.resource?.resourceId).toBe("resource-1")
    yield* store.confirmDeletion({ claim: lease.claim, expectedResource: deleting })
    expect((yield* store.inspect("session"))?.resource).toBeUndefined()
  }),
)
