import { expect, it, layer } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { AgentEvent } from "@batonfx/core"
import { ChildRuns, Errors, Runtime, RunStore } from "../src/index.js"
import { assistantAddress, completedResult, parentRelativeOptions } from "./helpers.js"
import { tempDbPath } from "./sqlite-helpers.js"

const scheduler = { pollInterval: "1 day" as const }
const memoryGroupLayer = Runtime.layerMemory({ ...parentRelativeOptions, scheduler })
const sqliteGroupLayer = (filename: string) => Runtime.layerSqlite({ ...parentRelativeOptions, scheduler, filename })

const groupSuspension = (waitId: string, groupId: string) =>
  AgentEvent.AgentSuspended.make({
    token: groupId,
    reason: "tool-wait",
    tool_call_id: waitId,
    tool_name: ChildRuns.awaitGroupToolName,
    tool_params: { groupId },
    tool_call_batch: [],
  })

const openGroupWait = (waitId: string) => ({
  waitId,
  reason: { _tag: "ToolWait" as const },
  status: "open" as const,
  openedAt: "2026-08-03T00:00:00.000Z",
})

const startGroup = (parentRunId: string, toolCallId = "start-group") =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const outcome = yield* ChildRuns.make(store).startGroup({
      parentRunId,
      toolCallId,
      concurrency: 3,
      members: [
        { key: "first", selection: "researcher", prompt: "first" },
        { key: "second", selection: "analyst", prompt: "second" },
        { key: "third", selection: "researcher", prompt: "third" },
      ],
    })
    if (outcome._tag !== "Success") return yield* Effect.die(`group admission returned ${outcome._tag}`)
    return yield* Schema.decodeUnknownEffect(ChildRuns.GroupReceipt)(outcome.result)
  })

layer(memoryGroupLayer)("model-facing durable child groups", (suite) => {
  suite.effect("narrows child selections in authority-derived tool schemas", () =>
    Effect.sync(() => {
      const tools = ChildRuns.makeTools({ children: [{ selection: "researcher" }] })
      const parameters = tools.startChildGroup.parametersSchema as typeof ChildRuns.StartGroupParameters
      const allowed = Schema.decodeUnknownOption(parameters)({
        concurrency: 1,
        members: [{ key: "one", selection: "researcher", prompt: "work" }],
      }).pipe(Option.getOrThrow)
      expect(allowed.members[0]!.selection).toBe("researcher")
      expect(
        Schema.decodeUnknownOption(parameters)({
          concurrency: 1,
          members: [{ key: "one", selection: "analyst", prompt: "work" }],
        }),
      ).toEqual(Option.none())
      expect(tools.runChild.name).toBe("run_child")
      expect(tools.startChildGroup.name).toBe("start_child_group")
      expect(tools.awaitChildGroup.name).toBe("await_child_group")
    }),
  )

  suite.effect("starts without blocking and resumes one durable join with ordered results", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const children = ChildRuns.make(store)
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "child-group:memory",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "parent" })
      const receipt = yield* startGroup(parent.runId)
      expect(receipt.children.map((child) => child.key)).toEqual(["first", "second", "third"])
      expect((yield* startGroup(parent.runId)).children).toEqual(receipt.children)
      expect(
        yield* Effect.forEach(receipt.children, (child) =>
          runtime.inspect(child.childRunId).pipe(Effect.map((run) => run.status)),
        ),
      ).toEqual(["running", "running", "running"])

      const waiting = yield* children.awaitGroup({
        parentRunId: parent.runId,
        toolCallId: "await-group",
        groupId: receipt.groupId,
      })
      expect(waiting).toEqual({ _tag: "Suspend", token: receipt.groupId })
      yield* store.suspend({
        ...parentClaim,
        wait: openGroupWait("await-group"),
        suspension: groupSuspension("await-group", receipt.groupId),
      })

      yield* store.complete({
        ...(yield* store.claimExecution({ runId: receipt.children[2]!.childRunId, ownerId: "third" })),
        result: completedResult("third result"),
      })
      yield* store.fail({
        ...(yield* store.claimExecution({ runId: receipt.children[1]!.childRunId, ownerId: "second" })),
        error: Errors.AgentExecutionFailure.make({ message: "second failed" }),
      })
      expect((yield* runtime.inspect(parent.runId)).status).toBe("waiting")
      yield* store.complete({
        ...(yield* store.claimExecution({ runId: receipt.children[0]!.childRunId, ownerId: "first" })),
        result: completedResult("first result"),
      })

      const parentInspection = yield* runtime.inspect(parent.runId)
      expect(parentInspection.status).toBe("running")
      expect(parentInspection.wait).toMatchObject({ waitId: "await-group", status: "signaled" })
      const resolution = parentInspection.wait?.resolution
      expect(resolution?._tag).toBe("Signal")
      const resumed = yield* Schema.decodeUnknownEffect(ChildRuns.GroupResult)(
        resolution?._tag === "Signal" ? resolution.payload : undefined,
      )
      expect(resumed.children.map((child) => child.key)).toEqual(["first", "second", "third"])
      expect(resumed.children.map((child) => child.status)).toEqual(["succeeded", "failed", "succeeded"])
      expect(resumed.children.map((child) => child.text)).toEqual(["first result", undefined, "third result"])
      expect(resumed.children[1]!.message).toBe("second failed")

      const terminal = yield* children.awaitGroup({
        parentRunId: parent.runId,
        toolCallId: "await-group",
        groupId: receipt.groupId,
      })
      expect(terminal._tag).toBe("Success")
      const history = yield* runtime.history({ runId: parent.runId, limit: 100 })
      expect(history.filter((event) => event._tag === "RunWaiting")).toHaveLength(1)
      expect(history.filter((event) => event._tag === "RunResumed")).toHaveLength(1)
    }),
  )

  suite.effect("cancels a suspended group with its parent without resuming the join", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const children = ChildRuns.make(store)
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "child-group:cancel",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "parent" })
      const receipt = yield* startGroup(parent.runId, "cancel-group")
      expect(
        yield* children.awaitGroup({
          parentRunId: parent.runId,
          toolCallId: "cancel-await",
          groupId: receipt.groupId,
        }),
      ).toEqual({ _tag: "Suspend", token: receipt.groupId })
      yield* store.suspend({
        ...parentClaim,
        wait: openGroupWait("cancel-await"),
        suspension: groupSuspension("cancel-await", receipt.groupId),
      })
      yield* runtime.cancel({ runId: parent.runId, reason: "stop group" })
      expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")
      expect((yield* runtime.inspectFanOut(receipt.groupId)).status).toBe("cancelled")
      expect(
        yield* Effect.forEach(receipt.children, (child) =>
          runtime.inspect(child.childRunId).pipe(Effect.map((run) => run.status)),
        ),
      ).toEqual(["cancelled", "cancelled", "cancelled"])
      const history = yield* runtime.history({ runId: parent.runId, limit: 100 })
      expect(history.filter((event) => event._tag === "RunWaiting")).toHaveLength(1)
      expect(history.filter((event) => event._tag === "RunResumed")).toHaveLength(0)
    }),
  )
})

it.live("persists one ordered child-group suspension and result across SQLite reopen", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("child-group")
    const admitted = yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const children = ChildRuns.make(store)
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "child-group:sqlite",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "parent" })
      const receipt = yield* startGroup(parent.runId)
      expect(
        yield* children.awaitGroup({
          parentRunId: parent.runId,
          toolCallId: "sqlite-await",
          groupId: receipt.groupId,
        }),
      ).toEqual({ _tag: "Suspend", token: receipt.groupId })
      yield* store.suspend({
        ...parentClaim,
        wait: openGroupWait("sqlite-await"),
        suspension: groupSuspension("sqlite-await", receipt.groupId),
      })
      return { parentRunId: parent.runId, receipt }
    }).pipe(Effect.provide(sqliteGroupLayer(filename)), Effect.scoped)

    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      expect(yield* runtime.inspect(admitted.parentRunId)).toMatchObject({
        status: "waiting",
        wait: { waitId: "sqlite-await", status: "open" },
      })
      yield* store.complete({
        ...(yield* store.claimExecution({ runId: admitted.receipt.children[2]!.childRunId, ownerId: "third" })),
        result: completedResult("third persisted"),
      })
      yield* store.complete({
        ...(yield* store.claimExecution({ runId: admitted.receipt.children[0]!.childRunId, ownerId: "first" })),
        result: completedResult("first persisted"),
      })
      yield* store.fail({
        ...(yield* store.claimExecution({ runId: admitted.receipt.children[1]!.childRunId, ownerId: "second" })),
        error: Errors.AgentExecutionFailure.make({ message: "persisted failure" }),
      })
      const parent = yield* runtime.inspect(admitted.parentRunId)
      expect(parent.status).toBe("running")
      expect(parent.wait).toMatchObject({ status: "signaled" })
    }).pipe(Effect.provide(sqliteGroupLayer(filename)), Effect.scoped)

    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const children = ChildRuns.make(store)
      const parent = yield* runtime.inspect(admitted.parentRunId)
      const resolution = parent.wait?.resolution
      const result = yield* Schema.decodeUnknownEffect(ChildRuns.GroupResult)(
        resolution?._tag === "Signal" ? resolution.payload : undefined,
      )
      expect(result.children.map((child) => child.key)).toEqual(["first", "second", "third"])
      expect(result.children.map((child) => child.status)).toEqual(["succeeded", "failed", "succeeded"])
      expect(result.children.map((child) => child.text)).toEqual(["first persisted", undefined, "third persisted"])
      const replay = yield* children.awaitGroup({
        parentRunId: admitted.parentRunId,
        toolCallId: "sqlite-await",
        groupId: admitted.receipt.groupId,
      })
      expect(replay._tag).toBe("Success")
      const history = yield* runtime.history({ runId: admitted.parentRunId, limit: 100 })
      expect(history.filter((event) => event._tag === "RunWaiting")).toHaveLength(1)
      expect(history.filter((event) => event._tag === "RunResumed")).toHaveLength(1)
    }).pipe(Effect.provide(sqliteGroupLayer(filename)), Effect.scoped)
  }),
)
