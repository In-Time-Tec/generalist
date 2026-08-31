import { expect, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { KernelResourceAuthority, TestKernel } from "../../src/repl/index.js"

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
    const authority = yield* TestKernel.makeMemoryResourceAuthority
    const [left, right] = yield* Effect.all(
      [Effect.exit(authority.acquire(request("host-a"))), Effect.exit(authority.acquire(request("host-b")))],
      { concurrency: "unbounded" },
    )
    expect([left, right].filter(Exit.isSuccess)).toHaveLength(1)
    let first
    if (Exit.isSuccess(left)) first = left.value
    else if (Exit.isSuccess(right)) first = right.value
    expect(first).toBeDefined()
    if (first === undefined) return

    yield* authority.bind({ claim: first.claim, resource: binding })
    const admitted = { ...first.claim, epoch: 0, profileDigest: "profile-v1", cellId: "active" }
    yield* authority.admit({ command: admitted, kind: "cell" })
    yield* authority.expire("session")

    const nextOwner = first.claim.ownerId === "host-a" ? "host-b" : "host-a"
    const takeover = yield* authority.acquire(request(nextOwner))
    expect(takeover.claim.generation).toBe(2)
    expect(takeover.resource?.activeCell).toEqual(admitted)
    const control = { ...takeover.claim, epoch: 0, profileDigest: "profile-v1", cellId: "control" }
    yield* authority.admit({ command: control, kind: "control", expectedCell: admitted })
    yield* authority.finish({ claim: takeover.claim, expectedCell: admitted })
    expect((yield* authority.inspect("session"))?.resource?.activeCell).toBeUndefined()

    const stale = yield* authority.renew(first.claim, 60_000).pipe(Effect.flip)
    expect(Schema.is(KernelResourceAuthority.KernelResourceRejected)(stale)).toBe(true)
    if (Schema.is(KernelResourceAuthority.KernelResourceRejected)(stale)) expect(stale.reason).toBe("stale-claim")

    const changedProfile = yield* authority.acquire({ ...request(nextOwner), profileDigest: "profile-v2" })
    const outdated = yield* authority
      .admit({
        command: { ...changedProfile.claim, epoch: 0, profileDigest: "profile-v1", cellId: "outdated" },
        kind: "control",
      })
      .pipe(Effect.flip)
    expect(Schema.is(KernelResourceAuthority.KernelResourceRejected)(outdated)).toBe(true)
    if (Schema.is(KernelResourceAuthority.KernelResourceRejected)(outdated)) {
      expect(outdated.reason).toBe("resource-mismatch")
    }
  }),
)

it.effect("prevents active pause and retains failed deletion until exact cleanup succeeds", () =>
  Effect.gen(function* () {
    const authority = yield* TestKernel.makeMemoryResourceAuthority
    const lease = yield* authority.acquire(request("host-a"))
    yield* authority.bind({ claim: lease.claim, resource: binding })
    const cell = { ...lease.claim, epoch: 0, profileDigest: "profile-v1", cellId: "active" }
    yield* authority.admit({ command: cell, kind: "cell" })
    const pauseFailure = yield* authority
      .bind({ claim: lease.claim, resource: { ...binding, state: "paused", checkpoint: "live-process" } })
      .pipe(Effect.flip)
    expect(Schema.is(KernelResourceAuthority.KernelResourceRejected)(pauseFailure)).toBe(true)
    if (Schema.is(KernelResourceAuthority.KernelResourceRejected)(pauseFailure)) {
      expect(pauseFailure.reason).toBe("cell-active")
    }

    yield* authority.finish({ claim: lease.claim, expectedCell: cell })
    yield* authority.bind({ claim: lease.claim, resource: { ...binding, state: "paused", checkpoint: "live-process" } })
    const deleting = yield* authority.revoke(lease.claim)
    expect(deleting).toBeDefined()
    if (deleting === undefined) return
    yield* authority.failDeletion({ claim: lease.claim, expectedResource: deleting }, "provider timeout")
    expect((yield* authority.pendingDeletion)[0]?.resource).toMatchObject({
      resourceId: "resource-1",
      state: "deleting",
      cleanupFailure: { attempts: 1, message: "provider timeout" },
    })

    const wrong = yield* authority
      .confirmDeletion({ claim: lease.claim, expectedResource: { ...deleting, resourceId: "resource-2" } })
      .pipe(Effect.flip)
    expect(Schema.is(KernelResourceAuthority.KernelResourceRejected)(wrong)).toBe(true)
    expect((yield* authority.inspect("session"))?.resource?.resourceId).toBe("resource-1")
    yield* authority.confirmDeletion({ claim: lease.claim, expectedResource: deleting })
    expect((yield* authority.inspect("session"))?.resource).toBeUndefined()
  }),
)
