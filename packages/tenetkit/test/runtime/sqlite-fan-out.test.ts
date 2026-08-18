import { expect, it as standalone, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Errors, Runtime, RunStore, RunTree } from "../../src/runtime/index.js"
import { assistantAddress, completedResult, researcherRef, textPrompt } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

const withDb =
  (filename: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Layer.build(sqliteLayer(filename)).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))),
    )

standalone.live("persists and resumes bounded fan-out across SQLite reopen", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("fan-out")
    const admitted = yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "sqlite:fan-out",
          idempotencyKey: "parent",
          prompt: "parent",
          treePolicy: { maxDepth: 1, maxSubagents: 1 },
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
        expect((yield* runtime.fanOut(input)).duplicate).toBe(true)
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
        return { ...receipt, parentRunId: parent.runId }
      }),
    )

    yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const before = yield* runtime.inspectFanOut(admitted.fanOutId)
        expect(before.members.map((member) => member.status)).toEqual(["running", "pending", "pending"])
        expect(before.members.map((member) => member.readiness)).toEqual(["ready", "queued", "queued"])
        const first = yield* store.claimExecution({ runId: admitted.childRunIds[0]!, ownerId: "first" })
        yield* store.complete({ ...first, result: completedResult("first") })
        expect(yield* runtime.inspect(admitted.childRunIds[1]!)).toMatchObject({
          status: "queued",
          childReadiness: "ready",
        })
      }),
    )

    yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const second = yield* store.claimExecution({ runId: admitted.childRunIds[1]!, ownerId: "second" })
        yield* store.complete({ ...second, result: completedResult("second") })
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
        const tree = yield* RunTree.history({ rootRunId: admitted.parentRunId, limit: 100 })
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

standalone.live("recovers a pending SQLite root outcome and settles it after fan-out join", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("terminal-parent-fan-out-join")
    const admitted = yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "sqlite:terminal-parent-fan-out-join",
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
        yield* runtime.steer({ runId: parent.runId, idempotencyKey: "prior", prompt: "prior" })
        const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "parent" })
        yield* store.complete({ ...parentClaim, result: { _tag: "Program", value: "parent" } })
        expect((yield* runtime.inspect(parent.runId)).status).toBe("waiting")
        yield* runtime.steer({ runId: parent.runId, idempotencyKey: "prior", prompt: "prior" })
        expect(
          yield* runtime.steer({ runId: parent.runId, idempotencyKey: "late", prompt: "late" }).pipe(Effect.flip),
        ).toBeInstanceOf(Errors.RunTerminal)
        expect((yield* runtime.fanOut(fanOutInput)).duplicate).toBe(true)
        expect(
          yield* runtime.fanOut({ ...fanOutInput, idempotencyKey: "late-fan-out" }).pipe(Effect.flip),
        ).toBeInstanceOf(Errors.FanOutInvalid)
        return { parentRunId: parent.runId, childRunId: receipt.childRunIds[0]! }
      }),
    )
    const settled = yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        expect((yield* runtime.inspect(admitted.parentRunId)).status).toBe("waiting")
        const childClaim = yield* store.claimExecution({ runId: admitted.childRunId, ownerId: "child" })
        yield* store.complete({ ...childClaim, result: completedResult("child") })
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
    yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const snapshot = yield* runtime.inspect(settled.parentRunId)
        expect(snapshot.status).toBe("succeeded")
        const terminal = yield* RunTree.inspect(settled.parentRunId)
        expect(terminal.runs.find((entry) => entry.run.runId === settled.parentRunId)!.outcome!.eventId).toBe(
          settled.completedEventId,
        )
        const history = yield* RunTree.history({ rootRunId: settled.parentRunId, limit: 100 })
        expect(history.events.filter((entry) => entry.event._tag === "FanOutJoined")).toHaveLength(1)
      }),
    )
  }),
)

layer(sqliteLayer(tempDbPath("fan-out-missing")))(
  "rejects an undeclared SQLite fan-out member without side effects",
  (it) => {
    it.effect("rejects an undeclared SQLite fan-out member without side effects", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "sqlite:fan-out-missing",
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
  },
)

layer(sqliteLayer(tempDbPath("fan-out-terminate")))(
  "rejects SQLite fan-out terminate remainder before admission",
  (it) => {
    it.effect("rejects SQLite fan-out terminate remainder before admission", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "sqlite:fan-out-terminate",
          idempotencyKey: "parent",
          prompt: "parent",
        })
        const before = yield* RunTree.inspect(parent.runId)
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
        expect(failure).toEqual(
          Errors.FanOutRemainderUnsupported.make({ remainder: "terminate", durability: "durable" }),
        )
        expect(yield* RunTree.inspect(parent.runId)).toEqual(before)
      }),
    )
  },
)

standalone.live("atomically reconciles SQLite parent cancellation across fan-out members", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("fan-out-cancel")
    yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "sqlite:fan-out-cancel",
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
        yield* runtime.cancel({ runId: parent.runId, reason: "stop" })
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

layer(sqliteLayer(tempDbPath("fan-out-cancel-claimed")))(
  "keeps SQLite fan-out cancellation pending for a claimed member",
  (it) => {
    it.effect("keeps SQLite fan-out cancellation pending for a claimed member", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "sqlite:fan-out-cancel-claimed",
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
        const claim = yield* store.claimExecution({ runId: receipt.childRunIds[0]!, ownerId: "active-child" })
        yield* runtime.cancel({ runId: parent.runId, reason: "stop" })
        expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelling")
        expect((yield* runtime.inspectFanOut(receipt.fanOutId)).status).toBe("running")
        yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "interrupted" }) })
        expect((yield* runtime.inspectFanOut(receipt.fanOutId)).status).toBe("cancelled")
        expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")
      }),
    )
  },
)

layer(sqliteLayer(tempDbPath("terminal-parent-fan-out")))(
  "rejects SQLite fan-out admission after the parent is terminal",
  (it) => {
    it.effect("rejects SQLite fan-out admission after the parent is terminal", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "sqlite:terminal-parent-fan-out",
          idempotencyKey: "parent",
          prompt: "parent",
        })
        const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "parent" })
        yield* store.complete({ ...claim, result: completedResult("done") })
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
  },
)
