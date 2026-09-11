import { expect, it as standalone, layer } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Errors, Runtime, RunStore, RunTree } from "../../../../../src/runtime/index.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../../../execution/object.js"
import {
  assistantAddress,
  assistantRef,
  completedResult,
  objectLayer,
  researcherRef,
  registrationsFor,
  resolverLayer,
  textPrompt,
} from "../../../execution/fixtures.js"

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
    const claim = yield* store.claimExecution({
      commandId: `${runId}:fan-out:succeed:claim`,
      runId,
      ownerId: objectWorkerId,
    })
    yield* store.complete({
      commandId: `${runId}:fan-out:succeed`,
      ...claim,
      result: completedResult(text),
    })
  })

const fail = (runId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const claim = yield* store.claimExecution({
      commandId: `${runId}:fan-out:fail:claim`,
      runId,
      ownerId: objectWorkerId,
    })
    yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "failed" }) })
  })

layer(objectLayer)("Runtime fan-out", (it) => {
  it.effect("indexes ordered admission and settlement events exactly once", () =>
    Effect.gen(function* () {
      const { parent, receipt } = yield* admit("tree-index")
      for (const childRunId of receipt.childRunIds) yield* succeed(childRunId)
      const page = yield* RunTree.replay({ rootRunId: parent.runId, limit: 100 })
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
      expect(duplicate).toEqual(receipt)
      expect((yield* runtime.inspectFanOut(receipt.fanOutId)).members.map((member) => member.ordinal)).toEqual([
        0, 1, 2,
      ])
      const conflictTarget = {
        parentRunId: input.parentRunId,
        idempotencyKey: input.idempotencyKey,
        existingFanOutId: receipt.fanOutId,
      }
      const conflict = yield* runtime.fanOut({ ...input, members: input.members.toReversed() }).pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.FanOutConflict)
      expect(conflict).toMatchObject(conflictTarget)
      const changedMembers = [...input.members]
      changedMembers[0] = { ...changedMembers[0]!, selection: "analyst" }
      const changedBinding = yield* runtime
        .fanOut({
          ...input,
          members: changedMembers,
        })
        .pipe(Effect.flip)
      expect(changedBinding).toBeInstanceOf(Errors.FanOutConflict)
      expect(changedBinding).toMatchObject(conflictTarget)
      const changedMetadata = [...input.members]
      changedMetadata[0] = {
        ...changedMetadata[0]!,
        metadata: { routing: { priority: 1, region: "local" } },
      }
      const metadataConflict = yield* runtime.fanOut({ ...input, members: changedMetadata }).pipe(Effect.flip)
      expect(metadataConflict).toBeInstanceOf(Errors.FanOutConflict)
      expect(metadataConflict).toMatchObject(conflictTarget)
      const countConflict = yield* runtime.fanOut({ ...input, members: input.members.slice(0, 2) }).pipe(Effect.flip)
      expect(countConflict).toBeInstanceOf(Errors.FanOutConflict)
      expect(countConflict).toMatchObject(conflictTarget)
    }),
  )

  it.effect("enforces concurrency one and promotes in ordinal order", () =>
    Effect.gen(function* () {
      const { runtime, receipt } = yield* admit("bounded", { concurrency: 1 })
      expect(
        yield* Effect.forEach(receipt.childRunIds, (runId) =>
          runtime.inspect(runId).pipe(Effect.map((run) => run.status)),
        ),
      ).toEqual(["queued", "queued", "queued"])
      expect((yield* runtime.inspectFanOut(receipt.fanOutId)).members.map((member) => member.status)).toEqual([
        "running",
        "pending",
        "pending",
      ])
      const firstHistory = yield* runtime.history({ runId: receipt.childRunIds[0]!, limit: 100 })
      expect(firstHistory.map((event) => event._tag)).toEqual(["RunAccepted"])
      yield* succeed(receipt.childRunIds[0]!)
      expect((yield* runtime.inspect(receipt.childRunIds[1]!)).status).toBe("queued")
      expect((yield* runtime.inspect(receipt.childRunIds[2]!)).status).toBe("queued")
      expect((yield* runtime.inspectFanOut(receipt.fanOutId)).members.map((member) => member.status)).toEqual([
        "succeeded",
        "running",
        "pending",
      ])
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
      expect(
        joined.members.map(
          (member) => Schema.decodeUnknownSync(Schema.Struct({ text: Schema.String }))(member.result).text,
        ),
      ).toEqual(["zero", "one", "two"])
    }),
  )

  it.effect("holds the parent outcome until fan-out join and emits no lifecycle event after terminal", () =>
    Effect.gen(function* () {
      const { runtime, parent, receipt } = yield* admit("await-terminal-parent", { count: 1 })
      yield* succeed(parent.runId)
      expect((yield* runtime.inspect(parent.runId)).status).toBe("waiting")
      yield* succeed(receipt.childRunIds[0]!)
      const rootEvents = (yield* RunTree.replay({ rootRunId: parent.runId, limit: 100 })).events
        .filter((entry) => entry.runId === parent.runId)
        .map((entry) => entry.event)
      const completed = rootEvents.find((event) => event._tag === "RunCompleted")!
      const joined = rootEvents.find((event) => event._tag === "FanOutJoined")!
      expect(joined.sequence).toBeLessThan(completed.sequence)
      expect(rootEvents.at(-1)?._tag).toBe("RunCompleted")
      expect(rootEvents.filter((event) => event._tag === "FanOutJoined")).toHaveLength(1)
      expect((yield* runtime.awaitFanOut(receipt.fanOutId)).status).toBe("succeeded")
      const snapshot = yield* runtime.inspect(parent.runId)
      expect(snapshot.status).toBe("succeeded")
      const terminal = (yield* RunTree.checkpoint(parent.runId)).inspection
      expect(terminal.runs.find((entry) => entry.run.runId === parent.runId)!.outcome!.eventId).toBe(completed.eventId)
    }),
  )

  it.effect("preserves a pending parent failure through fan-out join", () =>
    Effect.gen(function* () {
      const { runtime, parent, receipt } = yield* admit("pending-failure", { count: 1 })
      yield* fail(parent.runId)
      expect((yield* runtime.inspect(parent.runId)).status).toBe("waiting")
      yield* succeed(receipt.childRunIds[0]!)
      const events = yield* runtime.history({ runId: parent.runId, limit: 100 })
      expect(events.at(-2)?._tag).toBe("FanOutJoined")
      expect(events.at(-1)).toMatchObject({
        _tag: "RunFailed",
        error: Errors.AgentExecutionFailure.make({ message: "failed" }),
      })
    }),
  )

  it.effect("settles a parked fan-out member through its outer fan-out", () =>
    Effect.gen(function* () {
      const { runtime, receipt: outer } = yield* admit("nested-pending", { count: 1 })
      const memberRunId = outer.childRunIds[0]!
      const inner = yield* runtime.fanOut({
        parentRunId: memberRunId,
        idempotencyKey: "inner",
        members: [{ key: "analysis", selection: "analyst", prompt: "analyze" }],
        concurrency: 1,
        join: { _tag: "AllSuccess" },
        remainder: "await",
      })
      yield* succeed(memberRunId, "member")
      expect((yield* runtime.inspect(memberRunId)).status).toBe("waiting")
      yield* succeed(inner.childRunIds[0]!, "analysis")
      expect((yield* runtime.inspect(memberRunId)).status).toBe("succeeded")
      expect((yield* runtime.inspectFanOut(outer.fanOutId)).status).toBe("succeeded")
    }),
  )

  it.effect("makes a parked outcome win steering and new fan-out admission", () =>
    Effect.gen(function* () {
      const { runtime, parent, input, receipt } = yield* admit("pending-wins", { count: 1 })
      const store = yield* RunStore.RunStore
      yield* runtime.send(parent.runId, "prior", { idempotencyKey: "prior" })
      const claim = yield* store.claimExecution({
        commandId: "runtime-state-store-fan-out-service-test-ts-claim-3",
        runId: parent.runId,
        ownerId: objectWorkerId,
      })
      yield* store.complete({
        commandId: "runtime-memory-store-fan-out-service-test-ts-complete-2",
        ...claim,
        result: { _tag: "Program", value: "preserved" },
      })
      expect((yield* runtime.inspect(parent.runId)).status).toBe("waiting")
      yield* runtime.send(parent.runId, "prior", { idempotencyKey: "prior" })
      expect(yield* runtime.send(parent.runId, "late", { idempotencyKey: "late" }).pipe(Effect.flip)).toBeInstanceOf(
        Errors.RunTerminal,
      )
      expect(yield* runtime.fanOut(input)).toEqual(receipt)
      expect(yield* runtime.fanOut({ ...input, idempotencyKey: "late-fan-out" }).pipe(Effect.flip)).toBeInstanceOf(
        Errors.FanOutInvalid,
      )
      yield* succeed(receipt.childRunIds[0]!)
      expect((yield* runtime.history({ runId: parent.runId, limit: 100 })).at(-1)).toMatchObject({
        _tag: "RunCompleted",
        result: { _tag: "Program", value: "preserved" },
      })
    }),
  )

  it.effect("atomically rejects terminal and cancelling parents", () =>
    Effect.gen(function* () {
      for (const status of ["terminal", "cancelling"] as const) {
        const admitted = yield* admit(`reject-${status}`, { count: 1 })
        if (status === "terminal") {
          yield* succeed(admitted.parent.runId)
          yield* succeed(admitted.receipt.childRunIds[0]!)
        } else {
          const store = yield* RunStore.RunStore
          yield* store.claimExecution({
            commandId: "runtime-state-store-fan-out-service-test-ts-claim-5",
            runId: admitted.parent.runId,
            ownerId: objectWorkerId,
          })
          yield* store.cancel({
            commandId: "runtime-memory-store-fan-out-service-test-ts-cancel-3",
            runId: admitted.parent.runId,
            reason: "stop",
          })
        }
        const error = yield* admitted.runtime
          .fanOut({ ...admitted.input, idempotencyKey: `${admitted.input.idempotencyKey}:late` })
          .pipe(Effect.flip)
        expect(error).toBeInstanceOf(status === "terminal" ? Errors.RunTerminal : Errors.FanOutInvalid)
      }
    }),
  )

  it.effect("returns an admitted duplicate after terminal and rejects changed or new fan-out input", () =>
    Effect.gen(function* () {
      const { runtime, parent, input, receipt } = yield* admit("terminal-duplicate", { count: 1 })
      yield* succeed(parent.runId)
      yield* succeed(receipt.childRunIds[0]!)
      expect(yield* runtime.fanOut(input)).toEqual(receipt)
      const changed = yield* runtime
        .fanOut({ ...input, members: [{ ...input.members[0]!, prompt: "changed" }] })
        .pipe(Effect.flip)
      expect(changed).toBeInstanceOf(Errors.FanOutConflict)
      expect(changed).toMatchObject({
        parentRunId: parent.runId,
        idempotencyKey: input.idempotencyKey,
        existingFanOutId: receipt.fanOutId,
      })
      expect(
        yield* runtime.fanOut({ ...input, idempotencyKey: "new-after-terminal" }).pipe(Effect.flip),
      ).toBeInstanceOf(Errors.RunTerminal)
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
      yield* runtime.cancel({
        commandId: "runtime-memory-store-fan-out-service-test-ts-cancel-4",
        runId: parent.runId,
        reason: "stop",
      })
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
      const claim = yield* store.claimExecution({
        commandId: "runtime-state-store-fan-out-service-test-ts-claim-6",
        runId: receipt.childRunIds[0]!,
        ownerId: objectWorkerId,
      })
      yield* runtime.cancel({
        commandId: "runtime-memory-store-fan-out-service-test-ts-cancel-5",
        runId: parent.runId,
        reason: "stop",
      })
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
      const before = yield* RunTree.checkpoint(parent.runId)
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
      expect(yield* RunTree.checkpoint(parent.runId)).toEqual(before)
    }),
  )
})

const withObject =
  (storage: ReturnType<typeof makeObjectStorage>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Layer.build(
        objectRuntimeLayer(
          {
            addresses: [
              { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
            ],
          },
          storage,
        ).pipe(Layer.provide(resolverLayer)),
      ).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))),
    )

standalone.live("persists and resumes bounded fan-out across object storage reopen", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const admitted = yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "object:fan-out",
          idempotencyKey: "parent",
          prompt: "parent",
          treePolicy: { maxDepth: 1, maxSessions: 1024, concurrency: { agents: 1, tools: 1024 } },
        })
        const input: Runtime.FanOutInput = {
          parentRunId: parent.runId,
          idempotencyKey: "reviews",
          members: [0, 1, 2].map((ordinal) => ({
            key: `review-${ordinal}`,
            selection: "researcher",
            prompt: `review-${ordinal}`,
          })),
          concurrency: 1,
          join: { _tag: "Quorum", required: 2 },
          remainder: "abandon",
        }
        const receipt = yield* runtime.fanOut(input)
        expect(yield* runtime.fanOut(input)).toEqual(receipt)
        expect((yield* runtime.inspect(receipt.childRunIds[0]!)).executableRef).toEqual(researcherRef.ref)
        const changedMembers = [...input.members]
        changedMembers[0] = { ...changedMembers[0]!, selection: "analyst" }
        const changed = yield* runtime
          .fanOut({
            ...input,
            members: changedMembers,
          })
          .pipe(Effect.flip)
        expect(changed).toBeInstanceOf(Errors.FanOutConflict)
        expect(changed).toMatchObject({
          parentRunId: parent.runId,
          idempotencyKey: input.idempotencyKey,
          existingFanOutId: receipt.fanOutId,
        })
        return { ...receipt, parentRunId: parent.runId }
      }),
    )

    yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const before = yield* runtime.inspectFanOut(admitted.fanOutId)
        expect(before.members.map((member) => member.status)).toEqual(["running", "pending", "pending"])
        expect(before.members.map((member) => member.readiness)).toEqual(["ready", "queued", "queued"])
        const first = yield* store.claimExecution({
          commandId: "runtime-sql-store-fan-out-service-test-ts-claim-1",
          runId: admitted.childRunIds[0]!,
          ownerId: objectWorkerId,
        })
        yield* store.complete({
          commandId: "runtime-sql-store-fan-out-service-test-ts-complete-2",
          ...first,
          result: completedResult("first"),
        })
        expect(yield* runtime.inspect(admitted.childRunIds[1]!)).toMatchObject({
          status: "queued",
          childReadiness: "ready",
        })
      }),
    )

    yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const second = yield* store.claimExecution({
          commandId: "runtime-sql-store-fan-out-service-test-ts-claim-2",
          runId: admitted.childRunIds[1]!,
          ownerId: objectWorkerId,
        })
        yield* store.complete({
          commandId: "runtime-sql-store-fan-out-service-test-ts-complete-3",
          ...second,
          result: completedResult("second"),
        })
        const joined = yield* runtime.inspectFanOut(admitted.fanOutId)
        expect(joined.status).toBe("succeeded")
        const linked = (yield* runtime.history({ runId: admitted.parentRunId, limit: 100 })).filter(
          (event) => event._tag === "ChildLinked",
        )
        expect(linked.map((event) => event.selection)).toEqual(["researcher", "researcher", "researcher"])
        expect(linked.map((event) => event.prompt)).toEqual([
          textPrompt("review-0"),
          textPrompt("review-1"),
          textPrompt("review-2"),
        ])
        expect(joined.members.map((member) => member.status)).toEqual(["succeeded", "succeeded", "abandoned"])
        expect(joined.members.map((member) => member.ordinal)).toEqual([0, 1, 2])
        const tree = yield* RunTree.replay({ rootRunId: admitted.parentRunId, limit: 100 })
        const acceptedChildren = tree.events.filter(
          (entry) => entry.event._tag === "RunAccepted" && entry.parentRunId === admitted.parentRunId,
        )
        expect(acceptedChildren.map((entry) => entry.runId)).toEqual(admitted.childRunIds)
        expect(
          tree.events
            .filter((entry) => entry.event._tag === "RunCompleted" && admitted.childRunIds.includes(entry.runId))
            .map((entry) => entry.runId),
        ).toEqual(admitted.childRunIds.slice(0, 2))
        expect(
          tree.events.flatMap((entry) => (entry.event._tag === "ChildSettled" ? [entry.event.childRunId] : [])),
        ).toEqual(admitted.childRunIds.slice(0, 2))
        expect(tree.events.filter((entry) => entry.event._tag === "FanOutJoined")).toHaveLength(1)
      }),
    )
  }).pipe(Effect.asVoid),
)

standalone.live("recovers a pending object storage root outcome and settles it after fan-out join", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const admitted = yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "object:terminal-parent-fan-out-join",
          idempotencyKey: "parent",
          prompt: "parent",
        })
        const fanOutInput: Runtime.FanOutInput = {
          parentRunId: parent.runId,
          idempotencyKey: "reviews",
          members: [{ key: "review", selection: "researcher", prompt: "review" }],
          concurrency: 1,
          join: { _tag: "AllSuccess" },
          remainder: "await",
        }
        const receipt = yield* runtime.fanOut(fanOutInput)
        yield* runtime.send(parent.runId, "prior", { idempotencyKey: "prior" })
        const parentClaim = yield* store.claimExecution({
          commandId: "runtime-sql-store-fan-out-service-test-ts-claim-3",
          runId: parent.runId,
          ownerId: objectWorkerId,
        })
        yield* store.complete({
          commandId: "runtime-sql-store-fan-out-service-test-ts-complete-4",
          ...parentClaim,
          result: { _tag: "Program", value: "parent" },
        })
        expect((yield* runtime.inspect(parent.runId)).status).toBe("waiting")
        yield* runtime.send(parent.runId, "prior", { idempotencyKey: "prior" })
        expect(yield* runtime.send(parent.runId, "late", { idempotencyKey: "late" }).pipe(Effect.flip)).toBeInstanceOf(
          Errors.RunTerminal,
        )
        expect(yield* runtime.fanOut(fanOutInput)).toEqual(receipt)
        expect(
          yield* runtime.fanOut({ ...fanOutInput, idempotencyKey: "late-fan-out" }).pipe(Effect.flip),
        ).toBeInstanceOf(Errors.FanOutInvalid)
        return { parentRunId: parent.runId, childRunId: receipt.childRunIds[0]! }
      }),
    )
    const settled = yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        expect((yield* runtime.inspect(admitted.parentRunId)).status).toBe("waiting")
        const childClaim = yield* store.claimExecution({
          commandId: "runtime-sql-store-fan-out-service-test-ts-claim-4",
          runId: admitted.childRunId,
          ownerId: objectWorkerId,
        })
        yield* store.complete({
          commandId: "runtime-sql-store-fan-out-service-test-ts-complete-5",
          ...childClaim,
          result: completedResult("child"),
        })
        const rootEvents = yield* runtime.history({ runId: admitted.parentRunId, limit: 100 })
        const completed = rootEvents.find((event) => event._tag === "RunCompleted")!
        const joined = rootEvents.find((event) => event._tag === "FanOutJoined")!
        expect(joined.sequence).toBeLessThan(completed.sequence)
        expect(rootEvents.at(-1)?._tag).toBe("RunCompleted")
        expect(rootEvents.at(-1)).toMatchObject({ result: { _tag: "Program", value: "parent" } })
        expect(rootEvents.filter((event) => event._tag === "FanOutJoined")).toHaveLength(1)
        return { parentRunId: admitted.parentRunId, completedEventId: completed.eventId }
      }),
    )
    yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const snapshot = yield* runtime.inspect(settled.parentRunId)
        expect(snapshot.status).toBe("succeeded")
        const terminal = (yield* RunTree.checkpoint(settled.parentRunId)).inspection
        expect(terminal.runs.find((entry) => entry.run.runId === settled.parentRunId)!.outcome!.eventId).toBe(
          settled.completedEventId,
        )
        const history = yield* RunTree.replay({ rootRunId: settled.parentRunId, limit: 100 })
        expect(history.events.filter((entry) => entry.event._tag === "FanOutJoined")).toHaveLength(1)
      }),
    )
  }),
)

layer(objectLayer)("rejects an undeclared object storage fan-out member without side effects", (it) => {
  it.effect("rejects an undeclared object storage fan-out member without side effects", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "object:fan-out-missing",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const before = yield* RunTree.checkpoint(parent.runId)
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
      expect(yield* RunTree.checkpoint(parent.runId)).toEqual(before)
    }),
  )
})

layer(objectLayer)("rejects object storage fan-out terminate remainder before admission", (it) => {
  it.effect("rejects object storage fan-out terminate remainder before admission", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "object:fan-out-terminate",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const before = yield* RunTree.checkpoint(parent.runId)
      const failure = yield* runtime
        .fanOut({
          parentRunId: parent.runId,
          idempotencyKey: "terminate",
          members: [{ key: "review", selection: "researcher", prompt: "review" }],
          concurrency: 1,
          join: { _tag: "AllSuccess" },
          remainder: "terminate",
        })
        .pipe(Effect.flip)
      expect(failure).toEqual(Errors.FanOutRemainderUnsupported.make({ remainder: "terminate", durability: "durable" }))
      expect(yield* RunTree.checkpoint(parent.runId)).toEqual(before)
    }),
  )
})

standalone.live("atomically reconciles object storage parent cancellation across fan-out members", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "object:fan-out-cancel",
          idempotencyKey: "parent",
          prompt: "parent",
        })
        const receipt = yield* runtime.fanOut({
          parentRunId: parent.runId,
          idempotencyKey: "reviews",
          members: [0, 1].map((ordinal) => ({
            key: `review-${ordinal}`,
            selection: "researcher",
            prompt: `review-${ordinal}`,
          })),
          concurrency: 1,
          join: { _tag: "AllSuccess" },
          remainder: "await",
        })
        yield* runtime.cancel({
          commandId: "runtime-sql-store-fan-out-service-test-ts-cancel-1",
          runId: parent.runId,
          reason: "stop",
        })
        expect((yield* runtime.inspectFanOut(receipt.fanOutId)).status).toBe("cancelled")
        expect(
          yield* Effect.forEach(receipt.childRunIds, (runId) =>
            runtime.inspect(runId).pipe(Effect.map((run) => run.status)),
          ),
        ).toEqual(["cancelled", "cancelled"])
      }),
    )
  }).pipe(Effect.asVoid),
)

layer(objectLayer)("keeps object storage fan-out cancellation pending for a claimed member", (it) => {
  it.effect("keeps object storage fan-out cancellation pending for a claimed member", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "object:fan-out-cancel-claimed",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const receipt = yield* runtime.fanOut({
        parentRunId: parent.runId,
        idempotencyKey: "reviews",
        members: [{ key: "review", selection: "researcher", prompt: "review" }],
        concurrency: 1,
        join: { _tag: "AllSuccess" },
        remainder: "await",
      })
      const claim = yield* store.claimExecution({
        commandId: "runtime-sql-store-fan-out-service-test-ts-claim-5",
        runId: receipt.childRunIds[0]!,
        ownerId: objectWorkerId,
      })
      yield* runtime.cancel({
        commandId: "runtime-sql-store-fan-out-service-test-ts-cancel-1",
        runId: parent.runId,
        reason: "stop",
      })
      expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelling")
      expect((yield* runtime.inspectFanOut(receipt.fanOutId)).status).toBe("running")
      yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "interrupted" }) })
      expect((yield* runtime.inspectFanOut(receipt.fanOutId)).status).toBe("cancelled")
      expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")
    }),
  )
})

layer(objectLayer)("rejects object storage fan-out admission after the parent is terminal", (it) => {
  it.effect("rejects object storage fan-out admission after the parent is terminal", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "object:terminal-parent-fan-out",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const claim = yield* store.claimExecution({
        commandId: "runtime-sql-store-fan-out-service-test-ts-claim-6",
        runId: parent.runId,
        ownerId: objectWorkerId,
      })
      yield* store.complete({
        commandId: "runtime-sql-store-fan-out-service-test-ts-complete-6",
        ...claim,
        result: completedResult("done"),
      })
      const failure = yield* runtime
        .fanOut({
          parentRunId: parent.runId,
          idempotencyKey: "late",
          members: [{ key: "late", selection: "researcher", prompt: "late" }],
          concurrency: 1,
          join: { _tag: "AllSuccess" },
          remainder: "await",
        })
        .pipe(Effect.flip)
      expect(failure).toBeInstanceOf(Errors.RunTerminal)
    }),
  )
})
