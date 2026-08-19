import { expect, it, layer } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { Response } from "effect/unstable/ai"
import { AgentEvent, ToolContext, ToolExecutor } from "tenetkit"
import { ChildRuns, Errors, Runtime, RunStore } from "../../src/runtime/index.js"
import { assistantAddress, completedResult, parentRelativeOptions } from "./helpers.js"
import { tempDbPath } from "./sqlite-helpers.js"
import { provideScoped } from "./scoped-provide.js"

const scheduler = { pollInterval: "1 day" as const }
const memoryGroupLayer = Runtime.layerMemory({ ...parentRelativeOptions, scheduler })
const sqliteGroupLayer = (filename: string) => Runtime.layerSqlite({ ...parentRelativeOptions, scheduler, filename })

const toolRequest = (name: string, params: unknown): ToolExecutor.Request => {
  const call = Response.makePart("tool-call", { id: `call-${name}`, name, params, providerExecuted: false })
  return {
    call,
    toolCallBatch: { calls: [call] },
    turn: 0,
    toolCallIndex: 0,
    agentName: "child-group-test",
    sessionId: "child-group:test",
  }
}

const toolContextLayer = ToolContext.layerTest({
  signal: new AbortController().signal,
  emit: () => Effect.void,
  sessionId: "child-group:test",
  runId: "parent-run",
  toolCallId: "call-start_child_group",
})

const childRunsLayer = Layer.succeed(
  ChildRuns.ChildRuns,
  ChildRuns.ChildRuns.of({
    invoke: () => Effect.die("unexpected child invocation"),
    runGroup: () => Effect.die("unexpected blocking child-group invocation"),
    startGroup: () => Effect.die("invalid input reached child-group admission"),
    awaitGroup: () => Effect.die("unexpected child-group join"),
  }),
)

const childGroupRouteLayer = Layer.merge(toolContextLayer, childRunsLayer)

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

const groupMembers = [
  { key: "first", selection: "researcher", label: "First researcher", prompt: "first" },
  { key: "second", selection: "analyst", label: "Second analyst", prompt: "second" },
  { key: "third", selection: "researcher", prompt: "third" },
] as const

const startGroup = (parentRunId: string, toolCallId = "start-group") =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const outcome = yield* ChildRuns.make(store).startGroup({
      parentRunId,
      toolCallId,
      concurrency: 3,
      members: groupMembers,
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
        members: [{ key: "one", selection: "researcher", label: "Research card", prompt: "work" }],
      }).pipe(Option.getOrThrow)
      expect(allowed.members[0]!.selection).toBe("researcher")
      expect(allowed.members[0]!.label).toBe("Research card")
      const singletonParameters = tools.runChild.parametersSchema as typeof ChildRuns.Parameters
      const singleton = Schema.decodeUnknownOption(singletonParameters)({
        selection: "researcher",
        label: "Singleton card",
        prompt: "work",
      }).pipe(Option.getOrThrow)
      expect(singleton.label).toBe("Singleton card")
      expect(
        Schema.decodeUnknownOption(singletonParameters)({
          selection: "researcher",
          label: "x".repeat(257),
          prompt: "work",
        }),
      ).toEqual(Option.none())
      expect(
        Schema.decodeUnknownOption(parameters)({
          concurrency: 1,
          members: [{ key: "one", selection: "analyst", prompt: "work" }],
        }),
      ).toEqual(Option.none())
      expect(tools.runChild.name).toBe("run_child")
      expect(tools.runChildGroup.name).toBe("run_child_group")
      expect(tools.startChildGroup.name).toBe("start_child_group")
      expect(tools.startChildGroup.description).toContain("Members beyond the parent Run's active child capacity")
      expect(tools.startChildGroup.description).toContain("queue durably and promote automatically")
      expect(tools.awaitChildGroup.name).toBe("await_child_group")
    }),
  )

  suite.effect("reports the exact invalid child-group member field", () =>
    ChildRuns.route
      .execute(
        toolRequest(ChildRuns.startGroupToolName, {
          concurrency: 1,
          members: [{ key: "one", selection: 42, prompt: "work" }],
        }),
      )
      .pipe(
        (effect) => provideScoped(childGroupRouteLayer, effect),
        Effect.flip,
        Effect.tap((failure) =>
          Effect.sync(() => {
            if (!Schema.is(ToolExecutor.FrameworkFailure)(failure)) {
              throw new Error(`expected FrameworkFailure, got ${failure._tag}`)
            }
            expect({ stage: failure.stage, tool: failure.tool, message: failure.message }).toEqual({
              stage: "decode-input",
              tool: "start_child_group",
              message: "Expected string\n  at members[0].selection",
            })
          }),
        ),
      ),
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
      ).toEqual(["queued", "queued", "queued"])

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

  suite.effect("runs one blocking replay-safe group call and resumes the same parent exactly once", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const children = ChildRuns.make(store)
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "child-group:blocking",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "parent" })
      const input = {
        parentRunId: parent.runId,
        toolCallId: "run-group",
        operationKey: "turn:0:run-group",
        concurrency: 3,
        members: groupMembers,
      }
      const outcome = yield* children.runGroup(input)
      expect(outcome._tag).toBe("Suspend")
      const groupId = outcome._tag === "Suspend" ? outcome.token : ""
      yield* store.suspend({
        ...claim,
        wait: openGroupWait("run-group"),
        suspension: AgentEvent.AgentSuspended.make({
          token: groupId,
          reason: "tool-wait",
          tool_call_id: "run-group",
          tool_name: ChildRuns.runGroupToolName,
          tool_params: { concurrency: 3, members: groupMembers },
          tool_call_batch: [],
        }),
      })
      const inspection = yield* runtime.inspectFanOut(groupId)
      expect(
        inspection.members.map(({ key, selection, label, depth, origin }) => ({
          key,
          selection,
          label,
          depth,
          origin,
        })),
      ).toEqual([
        {
          key: "first",
          selection: "researcher",
          label: "First researcher",
          depth: 1,
          origin: { parentToolCallId: "run-group", operationKey: "turn:0:run-group" },
        },
        {
          key: "second",
          selection: "analyst",
          label: "Second analyst",
          depth: 1,
          origin: { parentToolCallId: "run-group", operationKey: "turn:0:run-group" },
        },
        {
          key: "third",
          selection: "researcher",
          label: undefined,
          depth: 1,
          origin: { parentToolCallId: "run-group", operationKey: "turn:0:run-group" },
        },
      ])
      const childRunIds = inspection.members.map((member) => member.childRunId)
      yield* store.complete({
        ...(yield* store.claimExecution({ runId: childRunIds[2]!, ownerId: "third" })),
        result: completedResult("third result"),
      })
      yield* store.fail({
        ...(yield* store.claimExecution({ runId: childRunIds[1]!, ownerId: "second" })),
        error: Errors.AgentExecutionFailure.make({ message: "second failed" }),
      })
      yield* store.complete({
        ...(yield* store.claimExecution({ runId: childRunIds[0]!, ownerId: "first" })),
        result: completedResult("first result"),
      })
      const resumed = yield* runtime.inspect(parent.runId)
      expect(resumed).toMatchObject({ status: "running", wait: { waitId: "run-group", status: "signaled" } })
      const replay = yield* children.runGroup(input)
      expect(replay._tag).toBe("Success")
      const result = yield* Schema.decodeUnknownEffect(ChildRuns.GroupResult)(
        replay._tag === "Success" ? replay.result : undefined,
      )
      expect(result.children.map((child) => [child.key, child.status, child.text])).toEqual([
        ["first", "succeeded", "first result"],
        ["second", "failed", undefined],
        ["third", "succeeded", "third result"],
      ])
      const history = yield* runtime.history({ runId: parent.runId, limit: 100 })
      expect(history.filter((event) => event._tag === "FanOutAdmitted")).toHaveLength(1)
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
    const admitted = yield* Effect.scoped(
      Effect.flatMap(Layer.build(sqliteGroupLayer(filename)), (context) =>
        Effect.gen(function* () {
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
          const singleton = yield* children.invoke({
            parentRunId: parent.runId,
            toolCallId: "sqlite-run-child",
            operationKey: "turn:0:sqlite-run-child",
            selection: "researcher",
            label: "Singleton researcher",
            prompt: "singleton",
          })
          expect(singleton._tag).toBe("Suspend")
          const singletonRunId = singleton._tag === "Suspend" ? singleton.token : ""
          const input = {
            parentRunId: parent.runId,
            toolCallId: "sqlite-run-group",
            operationKey: "turn:0:sqlite-run-group",
            concurrency: 3,
            members: groupMembers,
          }
          const outcome = yield* children.runGroup(input)
          expect(outcome._tag).toBe("Suspend")
          const groupId = outcome._tag === "Suspend" ? outcome.token : ""
          const inspection = yield* runtime.inspectFanOut(groupId)
          const receipt = {
            groupId,
            children: inspection.members.map(({ key, childRunId }) => ({ key, childRunId })),
          }
          yield* store.suspend({
            ...parentClaim,
            wait: openGroupWait("sqlite-run-group"),
            suspension: AgentEvent.AgentSuspended.make({
              token: groupId,
              reason: "tool-wait",
              tool_call_id: "sqlite-run-group",
              tool_name: ChildRuns.runGroupToolName,
              tool_params: { concurrency: 3, members: groupMembers },
              tool_call_batch: [],
            }),
          })
          return { parentRunId: parent.runId, singletonRunId, receipt, input }
        }).pipe(Effect.provideContext(context)),
      ),
    )

    yield* Effect.scoped(
      Effect.flatMap(Layer.build(sqliteGroupLayer(filename)), (context) =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          expect(yield* runtime.inspect(admitted.parentRunId)).toMatchObject({
            status: "waiting",
            wait: { waitId: "sqlite-run-group", status: "open" },
          })
          const recursive = yield* runtime.spawn({
            parentRunId: admitted.singletonRunId,
            invocationId: "reopen-recursive-child",
            selection: "analyst",
            prompt: "resolve from reopened profile registry",
          })
          expect(yield* runtime.inspect(recursive.runId)).toMatchObject({
            parentRunId: admitted.singletonRunId,
            depth: 2,
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
        }).pipe(Effect.provideContext(context)),
      ),
    )

    yield* Effect.scoped(
      Effect.flatMap(Layer.build(sqliteGroupLayer(filename)), (context) =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const children = ChildRuns.make(store)
          const parent = yield* runtime.inspect(admitted.parentRunId)
          const resolution = parent.wait?.resolution
          const result = yield* Schema.decodeUnknownEffect(ChildRuns.GroupResult)(
            resolution?._tag === "Signal" ? resolution.payload : undefined,
          )
          expect(result.children.map((child) => child.key)).toEqual(["first", "second", "third"])
          expect(result.children.map((child) => child.label)).toEqual(["First researcher", "Second analyst", undefined])
          expect(result.children.map((child) => child.status)).toEqual(["succeeded", "failed", "succeeded"])
          expect(result.children.map((child) => child.text)).toEqual(["first persisted", undefined, "third persisted"])
          const replay = yield* children.runGroup(admitted.input)
          expect(replay._tag).toBe("Success")
          const singletonReplay = yield* children.invoke({
            parentRunId: admitted.parentRunId,
            toolCallId: "sqlite-run-child",
            operationKey: "turn:0:sqlite-run-child",
            selection: "researcher",
            label: "Singleton researcher",
            prompt: "singleton",
          })
          expect(singletonReplay).toEqual({ _tag: "Suspend", token: admitted.singletonRunId })
          const singletonConflict = yield* children.invoke({
            parentRunId: admitted.parentRunId,
            toolCallId: "sqlite-run-child",
            operationKey: "turn:0:sqlite-run-child",
            selection: "researcher",
            label: "Changed singleton label",
            prompt: "singleton",
          })
          expect(singletonConflict._tag).toBe("DomainFailure")
          const history = yield* runtime.history({ runId: admitted.parentRunId, limit: 100 })
          expect(
            history.find((event) => event._tag === "ChildLinked" && event.childRunId === admitted.singletonRunId),
          ).toMatchObject({
            _tag: "ChildLinked",
            childRunId: admitted.singletonRunId,
            selection: "researcher",
            label: "Singleton researcher",
            childDepth: 1,
            origin: {
              parentToolCallId: "sqlite-run-child",
              operationKey: "turn:0:sqlite-run-child",
            },
          })
          expect(
            history
              .filter((event) => event._tag === "ChildLinked" && event.childRunId !== admitted.singletonRunId)
              .map((event) => (event._tag === "ChildLinked" ? event.label : undefined)),
          ).toEqual(["First researcher", "Second analyst", undefined])
          const tree = yield* runtime.treeHistory({ rootRunId: admitted.parentRunId, limit: 100 })
          expect(
            tree.events.find(
              (entry) => entry.event._tag === "ChildLinked" && entry.event.childRunId === admitted.singletonRunId,
            ),
          ).toMatchObject({
            runId: admitted.parentRunId,
            toolCallId: "sqlite-run-child",
            event: {
              _tag: "ChildLinked",
              childRunId: admitted.singletonRunId,
              label: "Singleton researcher",
            },
          })
          expect(history.filter((event) => event._tag === "RunWaiting")).toHaveLength(1)
          expect(history.filter((event) => event._tag === "RunResumed")).toHaveLength(1)
        }).pipe(Effect.provideContext(context)),
      ),
    )
  }),
)

it.live("resumes one labelled singleton from canonical child settlement across SQLite reopens", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("child-singleton")
    const admitted = yield* Effect.scoped(
      Effect.flatMap(Layer.build(sqliteGroupLayer(filename)), (context) =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const parent = yield* runtime.send({
            to: assistantAddress,
            sessionId: "child-singleton:sqlite",
            idempotencyKey: "parent",
            prompt: "parent",
          })
          const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "parent" })
          const input = {
            parentRunId: parent.runId,
            toolCallId: "sqlite-child-call",
            operationKey: "turn:4:sqlite-child-call",
            selection: "researcher",
            label: "Persisted singleton 🚀",
            prompt: "persist me",
          }
          const outcome = yield* ChildRuns.make(store).invoke(input)
          expect(outcome._tag).toBe("Suspend")
          const childRunId = outcome._tag === "Suspend" ? outcome.token : ""
          yield* store.suspend({
            ...claim,
            wait: openGroupWait(input.toolCallId),
            suspension: AgentEvent.AgentSuspended.make({
              token: childRunId,
              reason: "tool-wait",
              tool_call_id: input.toolCallId,
              tool_name: ChildRuns.toolName,
              tool_params: { selection: input.selection, label: input.label, prompt: input.prompt },
              tool_call_batch: [],
            }),
          })
          return { input, childRunId }
        }).pipe(Effect.provideContext(context)),
      ),
    )

    yield* Effect.scoped(
      Effect.flatMap(Layer.build(sqliteGroupLayer(filename)), (context) =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          expect(yield* runtime.inspect(admitted.input.parentRunId)).toMatchObject({
            status: "waiting",
            wait: { waitId: admitted.input.toolCallId, status: "open" },
          })
          yield* store.complete({
            ...(yield* store.claimExecution({ runId: admitted.childRunId, ownerId: "child" })),
            result: completedResult("persisted singleton result"),
          })
          expect(yield* runtime.inspect(admitted.input.parentRunId)).toMatchObject({
            status: "running",
            wait: {
              status: "responded",
              resolution: {
                _tag: "ToolResult",
                result: {
                  _tag: "Succeeded",
                  childRunId: admitted.childRunId,
                  label: admitted.input.label,
                  text: "persisted singleton result",
                },
              },
            },
          })
        }).pipe(Effect.provideContext(context)),
      ),
    )

    yield* Effect.scoped(
      Effect.flatMap(Layer.build(sqliteGroupLayer(filename)), (context) =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          expect(yield* ChildRuns.make(store).invoke(admitted.input)).toMatchObject({
            _tag: "Success",
            result: {
              _tag: "Succeeded",
              childRunId: admitted.childRunId,
              label: admitted.input.label,
              text: "persisted singleton result",
            },
          })
          const history = yield* runtime.history({ runId: admitted.input.parentRunId, limit: 100 })
          expect(history.filter((event) => event._tag === "RunWaiting")).toHaveLength(1)
          expect(history.filter((event) => event._tag === "RunResumed")).toHaveLength(1)
          expect(
            history.find((event) => event._tag === "ChildLinked" && event.childRunId === admitted.childRunId),
          ).toMatchObject({
            label: admitted.input.label,
            origin: {
              parentToolCallId: admitted.input.toolCallId,
              operationKey: admitted.input.operationKey,
            },
          })
        }).pipe(Effect.provideContext(context)),
      ),
    )
  }),
)
