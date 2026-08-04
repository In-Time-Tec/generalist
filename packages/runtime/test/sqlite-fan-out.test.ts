import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Errors, Runtime, RunStore, RunTree } from "../src/index.js"
import { assistantAddress, completedResult, researcherRef } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

it.live("persists and resumes bounded fan-out across SQLite reopen", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("fan-out")
    const admitted = yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "sqlite:fan-out",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const input: Runtime.FanOutInput = {
        parentRunId: parent.runId,
        idempotencyKey: "reviews",
        members: [0, 1, 2].map((ordinal) => ({
          key: `review-${ordinal}`,
          agent: researcherRef,
          prompt: `review-${ordinal}`,
        })),
        concurrency: 1,
        join: { _tag: "Quorum", required: 2 },
        remainder: "abandon",
      }
      const receipt = yield* runtime.fanOut(input)
      expect((yield* runtime.fanOut(input)).duplicate).toBe(true)
      return { ...receipt, parentRunId: parent.runId }
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const before = yield* runtime.inspectFanOut(admitted.fanOutId)
      expect(before.members.map((member) => member.status)).toEqual(["running", "pending", "pending"])
      const first = yield* store.claimExecution({ runId: admitted.childRunIds[0]!, ownerId: "first" })
      yield* store.complete({ ...first, result: completedResult("first") })
      expect((yield* runtime.inspect(admitted.childRunIds[1]!)).status).toBe("running")
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const second = yield* store.claimExecution({ runId: admitted.childRunIds[1]!, ownerId: "second" })
      yield* store.complete({ ...second, result: completedResult("second") })
      const joined = yield* runtime.inspectFanOut(admitted.fanOutId)
      expect(joined.status).toBe("succeeded")
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
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  }).pipe(Effect.asVoid),
)

it.live("atomically reconciles SQLite parent cancellation across fan-out members", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("fan-out-cancel")
    yield* Effect.gen(function* () {
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
          agent: researcherRef,
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
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  }).pipe(Effect.asVoid),
)

it.live("keeps SQLite fan-out cancellation pending for a claimed member", () =>
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
      members: [{ key: "review", agent: researcherRef, prompt: "review" }],
      concurrency: 1,
      join: { _tag: "AllSuccess" },
      remainder: "await",
    })
    const claim = yield* store.claimExecution({ runId: receipt.childRunIds[0]!, ownerId: "active-child" })
    yield* runtime.cancel({ runId: parent.runId, reason: "stop" })
    expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelling")
    expect((yield* runtime.inspectFanOut(receipt.fanOutId)).status).toBe("running")
    yield* store.fail({ ...claim, error: { message: "interrupted" } })
    expect((yield* runtime.inspectFanOut(receipt.fanOutId)).status).toBe("cancelled")
    expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")
  }).pipe(Effect.provide(sqliteLayer(tempDbPath("fan-out-cancel-claimed"))), Effect.scoped),
)

it.live("rejects SQLite fan-out admission after the parent is terminal", () =>
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
        members: [{ key: "late", agent: researcherRef, prompt: "late" }],
        concurrency: 1,
        join: { _tag: "AllSuccess" },
        remainder: "await",
      })
      .pipe(Effect.flip)
    expect(failure).toBeInstanceOf(Errors.RunTerminal)
  }).pipe(Effect.provide(sqliteLayer(tempDbPath("terminal-parent-fan-out"))), Effect.scoped),
)
