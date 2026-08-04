import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, Ref } from "effect"
import { Errors, ExecutableResolver, Runtime, RunStore, RunTree } from "../src/index.js"
import { makeRuntime } from "../src/memory/runtime-layer.js"
import { layer as activeExecutionsLayer } from "../src/active-executions.js"
import {
  assistant,
  assistantAddress,
  assistantRef,
  completedResult,
  memoryLayer,
  researcher,
  researcherRef,
} from "./helpers.js"

const admit = (
  key: string,
  options?: {
    readonly join?: Runtime.FanOutInput["join"]
    readonly remainder?: Runtime.FanOutInput["remainder"]
    readonly concurrency?: number
    readonly count?: number
  },
) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const parent = yield* runtime.send({
      to: assistantAddress,
      sessionId: `fan-out:${key}`,
      idempotencyKey: "parent",
      prompt: "parent",
    })
    const count = options?.count ?? 3
    const input: Runtime.FanOutInput = {
      parentRunId: parent.runId,
      idempotencyKey: key,
      members: Array.from({ length: count }, (_, ordinal) => ({
        key: `member-${ordinal}`,
        selection: "researcher",
        prompt: `member-${ordinal}`,
        metadata: { routing: { priority: ordinal, region: "local" } },
      })),
      concurrency: options?.concurrency ?? count,
      join: options?.join ?? { _tag: "AllSuccess" },
      remainder: options?.remainder ?? "await",
    }
    return { runtime, parent, input, receipt: yield* runtime.fanOut(input) }
  })

const succeed = (runId: string, text = runId) =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    yield* store.complete({
      ...(yield* store.claimExecution({ runId, ownerId: `owner:${runId}` })),
      result: completedResult(text),
    })
  })

const fail = (runId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    yield* store.fail({
      ...(yield* store.claimExecution({ runId, ownerId: `owner:${runId}` })),
      error: Errors.AgentExecutionFailure.make({ message: "failed" }),
    })
  })

layer(memoryLayer)("Runtime fan-out", (it) => {
  it.effect("indexes ordered admission and settlement events exactly once", () =>
    Effect.gen(function* () {
      const { parent, receipt } = yield* admit("tree-index")
      for (const childRunId of receipt.childRunIds) yield* succeed(childRunId)
      const page = yield* RunTree.history({ rootRunId: parent.runId, limit: 100 })
      const acceptedChildren = page.events
        .filter((entry) => entry.event._tag === "RunAccepted" && entry.runId !== parent.runId)
        .map((entry) => entry.runId)
      expect(acceptedChildren).toEqual(receipt.childRunIds)
      expect(page.events.filter((entry) => entry.event._tag === "RunCompleted")).toHaveLength(3)
      expect(page.events.filter((entry) => entry.event._tag === "ChildSettled")).toHaveLength(3)
      expect(page.events.filter((entry) => entry.event._tag === "FanOutJoined")).toHaveLength(1)
    }),
  )

  it.effect("admits one immutable ordered aggregate idempotently", () =>
    Effect.gen(function* () {
      const { runtime, input, receipt } = yield* admit("idempotent")
      const reorderedMetadata = [...input.members]
      reorderedMetadata[0] = {
        ...reorderedMetadata[0]!,
        metadata: { routing: { region: "local", priority: 0 } },
      }
      const duplicate = yield* runtime.fanOut({ ...input, members: reorderedMetadata })
      expect(duplicate).toEqual({ ...receipt, duplicate: true })
      expect((yield* runtime.inspectFanOut(receipt.fanOutId)).members.map((member) => member.ordinal)).toEqual([
        0, 1, 2,
      ])
      const conflict = yield* runtime.fanOut({ ...input, members: input.members.toReversed() }).pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.FanOutConflict)
      const changedMembers = [...input.members]
      changedMembers[0] = { ...changedMembers[0]!, selection: "analyst" }
      const changedBinding = yield* runtime
        .fanOut({
          ...input,
          members: changedMembers,
        })
        .pipe(Effect.flip)
      expect(changedBinding).toBeInstanceOf(Errors.FanOutConflict)
      const changedMetadata = [...input.members]
      changedMetadata[0] = {
        ...changedMetadata[0]!,
        metadata: { routing: { priority: 1, region: "local" } },
      }
      const metadataConflict = yield* runtime.fanOut({ ...input, members: changedMetadata }).pipe(Effect.flip)
      expect(metadataConflict).toBeInstanceOf(Errors.FanOutConflict)
    }),
  )

  it.effect("enforces concurrency one and promotes in ordinal order", () =>
    Effect.gen(function* () {
      const { runtime, receipt } = yield* admit("bounded", { concurrency: 1 })
      expect(
        yield* Effect.forEach(receipt.childRunIds, (runId) =>
          runtime.inspect(runId).pipe(Effect.map((run) => run.status)),
        ),
      ).toEqual(["running", "queued", "queued"])
      yield* succeed(receipt.childRunIds[0]!)
      expect((yield* runtime.inspect(receipt.childRunIds[1]!)).status).toBe("running")
      expect((yield* runtime.inspect(receipt.childRunIds[2]!)).status).toBe("queued")
    }),
  )

  it.effect("implements all-success and deterministic ordinal results", () =>
    Effect.gen(function* () {
      const { runtime, receipt } = yield* admit("all-success")
      yield* succeed(receipt.childRunIds[2]!, "two")
      yield* succeed(receipt.childRunIds[0]!, "zero")
      yield* succeed(receipt.childRunIds[1]!, "one")
      const joined = yield* runtime.inspectFanOut(receipt.fanOutId)
      expect(joined.status).toBe("succeeded")
      expect(joined.members.map((member) => member.ordinal)).toEqual([0, 1, 2])
      expect(joined.members.map((member) => (member.result as { text: string }).text)).toEqual(["zero", "one", "two"])
    }),
  )

  it.effect("awaits the durable join and reconciles after the parent is terminal", () =>
    Effect.gen(function* () {
      const { runtime, parent, receipt } = yield* admit("await-terminal-parent", { count: 1 })
      yield* succeed(parent.runId)
      const waiting = yield* runtime.awaitFanOut(receipt.fanOutId).pipe(Effect.forkChild)
      yield* succeed(receipt.childRunIds[0]!)
      expect((yield* Fiber.join(waiting)).status).toBe("succeeded")
    }),
  )

  it.effect("rechecks the aggregate after establishing child cursors", () =>
    Effect.gen(function* () {
      const { receipt } = yield* admit("await-cursor-race", { count: 1 })
      const store = yield* RunStore.RunStore
      const childRunId = receipt.childRunIds[0]!
      const claim = yield* store.claimExecution({ runId: childRunId, ownerId: "race" })
      const completed = yield* Ref.make(false)
      const racingStore = RunStore.RunStore.of({
        ...store,
        inspect: (runId) =>
          runId !== childRunId
            ? store.inspect(runId)
            : Ref.getAndSet(completed, true).pipe(
                Effect.flatMap((alreadyCompleted) =>
                  alreadyCompleted
                    ? store.inspect(runId)
                    : store
                        .complete({ ...claim, result: completedResult("race") })
                        .pipe(Effect.orDie)
                        .pipe(Effect.andThen(store.inspect(runId))),
                ),
              ),
      })
      const racingRuntime = yield* makeRuntime({
        resolver: ExecutableResolver.makeStatic([
          { executable: assistantRef, agent: assistant },
          { executable: researcherRef, agent: researcher },
        ]),
        addresses: [{ address: assistantAddress, executable: assistantRef }],
      }).pipe(Effect.provideService(RunStore.RunStore, racingStore), Effect.provide(activeExecutionsLayer))
      expect((yield* racingRuntime.awaitFanOut(receipt.fanOutId)).status).toBe("succeeded")
    }),
  )

  it.effect("atomically rejects terminal and cancelling parents", () =>
    Effect.gen(function* () {
      for (const status of ["terminal", "cancelling"] as const) {
        const admitted = yield* admit(`reject-${status}`, { count: 1 })
        if (status === "terminal") {
          yield* succeed(admitted.parent.runId)
        } else {
          const store = yield* RunStore.RunStore
          yield* store.claimExecution({ runId: admitted.parent.runId, ownerId: "active-parent" })
          yield* store.cancel({ runId: admitted.parent.runId, reason: "stop" })
        }
        const error = yield* admitted.runtime
          .fanOut({ ...admitted.input, idempotencyKey: `${admitted.input.idempotencyKey}:late` })
          .pipe(Effect.flip)
        expect(error).toBeInstanceOf(status === "terminal" ? Errors.RunTerminal : Errors.FanOutInvalid)
      }
    }),
  )

  it.effect("implements all-settled and best-effort", () =>
    Effect.gen(function* () {
      for (const [key, join] of [
        ["all-settled", { _tag: "AllSettled" }],
        ["best-effort", { _tag: "BestEffort" }],
      ] as const) {
        const { runtime, receipt } = yield* admit(key, { join })
        yield* fail(receipt.childRunIds[0]!)
        yield* succeed(receipt.childRunIds[1]!)
        yield* fail(receipt.childRunIds[2]!)
        const joined = yield* runtime.inspectFanOut(receipt.fanOutId)
        expect(joined.status).toBe("succeeded")
        expect(joined.members.map((member) => member.status)).toEqual(["failed", "succeeded", "failed"])
      }
    }),
  )

  it.effect("implements first-success, quorum, and quorum impossibility", () =>
    Effect.gen(function* () {
      const first = yield* admit("first", { join: { _tag: "FirstSuccess" }, remainder: "abandon" })
      yield* succeed(first.receipt.childRunIds[1]!)
      const firstJoined = yield* first.runtime.inspectFanOut(first.receipt.fanOutId)
      expect(firstJoined.status).toBe("succeeded")
      expect(firstJoined.members.map((member) => member.status)).toEqual(["abandoned", "succeeded", "abandoned"])

      const quorum = yield* admit("quorum", { join: { _tag: "Quorum", required: 2 }, remainder: "abandon" })
      yield* succeed(quorum.receipt.childRunIds[2]!)
      yield* succeed(quorum.receipt.childRunIds[0]!)
      expect((yield* quorum.runtime.inspectFanOut(quorum.receipt.fanOutId)).status).toBe("succeeded")

      const impossible = yield* admit("impossible", { join: { _tag: "Quorum", required: 2 }, remainder: "abandon" })
      yield* fail(impossible.receipt.childRunIds[0]!)
      yield* fail(impossible.receipt.childRunIds[1]!)
      expect((yield* impossible.runtime.inspectFanOut(impossible.receipt.fanOutId)).status).toBe("failed")

      const impossibleAwait = yield* admit("impossible-await", {
        join: { _tag: "Quorum", required: 2 },
        remainder: "await",
      })
      yield* fail(impossibleAwait.receipt.childRunIds[0]!)
      yield* fail(impossibleAwait.receipt.childRunIds[1]!)
      const failedAwait = yield* impossibleAwait.runtime.awaitFanOut(impossibleAwait.receipt.fanOutId)
      expect(failedAwait.status).toBe("failed")
      expect(failedAwait.members[2]!.status).toBe("running")
    }),
  )

  it.effect("requests and records cancellation for unnecessary members", () =>
    Effect.gen(function* () {
      const { runtime, receipt } = yield* admit("request-cancel", {
        join: { _tag: "FirstSuccess" },
        remainder: "request-cancel",
      })
      yield* succeed(receipt.childRunIds[1]!)
      const joined = yield* runtime.inspectFanOut(receipt.fanOutId)
      expect(joined.status).toBe("succeeded")
      expect(joined.members.map((member) => member.status)).toEqual(["cancelled", "succeeded", "cancelled"])
      expect(
        yield* Effect.forEach(receipt.childRunIds, (runId) =>
          runtime.inspect(runId).pipe(Effect.map((run) => run.status)),
        ),
      ).toEqual(["cancelled", "succeeded", "cancelled"])
    }),
  )

  it.effect("reconciles every member when the parent is cancelled", () =>
    Effect.gen(function* () {
      const { runtime, parent, receipt } = yield* admit("cancel", { concurrency: 1 })
      yield* runtime.cancel({ runId: parent.runId, reason: "stop" })
      expect((yield* runtime.inspectFanOut(receipt.fanOutId)).status).toBe("cancelled")
      expect(
        yield* Effect.forEach(receipt.childRunIds, (runId) =>
          runtime.inspect(runId).pipe(Effect.map((run) => run.status)),
        ),
      ).toEqual(["cancelled", "cancelled", "cancelled"])
    }),
  )

  it.effect("keeps cancellation nonterminal until a claimed member settles", () =>
    Effect.gen(function* () {
      const { runtime, parent, receipt } = yield* admit("cancel-claimed", { count: 1 })
      const store = yield* RunStore.RunStore
      const claim = yield* store.claimExecution({ runId: receipt.childRunIds[0]!, ownerId: "active-child" })
      yield* runtime.cancel({ runId: parent.runId, reason: "stop" })
      expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelling")
      expect((yield* runtime.inspect(receipt.childRunIds[0]!)).status).toBe("cancelling")
      expect((yield* runtime.inspectFanOut(receipt.fanOutId)).status).toBe("running")
      yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "interrupted" }) })
      expect((yield* runtime.inspect(receipt.childRunIds[0]!)).status).toBe("cancelled")
      expect((yield* runtime.inspectFanOut(receipt.fanOutId)).status).toBe("cancelled")
      expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")
    }),
  )

  it.effect("rejects invalid admission and unprovable termination", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "invalid",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const base: Runtime.FanOutInput = {
        parentRunId: parent.runId,
        idempotencyKey: "invalid",
        members: [{ key: "one", selection: "researcher", prompt: "one" }],
        concurrency: 1,
        join: { _tag: "AllSuccess" },
        remainder: "terminate",
      }
      expect(yield* runtime.fanOut(base).pipe(Effect.flip)).toBeInstanceOf(Errors.FanOutRemainderUnsupported)
      expect(yield* runtime.fanOut({ ...base, remainder: "await", concurrency: 0 }).pipe(Effect.flip)).toBeInstanceOf(
        Errors.FanOutInvalid,
      )
      for (const required of [Number.NaN, 1.5, -1, 0, 2]) {
        expect(
          yield* runtime.fanOut({ ...base, remainder: "await", join: { _tag: "Quorum", required } }).pipe(Effect.flip),
        ).toBeInstanceOf(Errors.FanOutInvalid)
      }
    }),
  )

  it.effect("rejects an undeclared member atomically", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "fan-out:missing-selection",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const before = yield* RunTree.inspect(parent.runId)
      const failure = yield* runtime
        .fanOut({
          parentRunId: parent.runId,
          idempotencyKey: "missing",
          members: [
            { key: "valid", selection: "researcher", prompt: "valid" },
            { key: "missing", selection: "undeclared", prompt: "missing" },
          ],
          concurrency: 2,
          join: { _tag: "AllSuccess" },
          remainder: "await",
        })
        .pipe(Effect.flip)
      expect(failure).toBeInstanceOf(Errors.ChildSelectionMissing)
      expect(yield* RunTree.inspect(parent.runId)).toEqual(before)
    }),
  )
})
