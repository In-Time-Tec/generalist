import "./suites/tree-follow-suite.js"
import "./suites/run-tree-codec-suite.js"
import { expect, it as testIt, layer } from "@effect/vitest"
import { Effect, Fiber, Ref, Schedule, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Agent, ExecutableManifest, Pins, ProgramManifest } from "../../src/index.js"
import { Errors, ExecutableRegistration, RunStore, RunTree, Runtime, RunWait } from "../../src/runtime/index.js"
import { make as makeTreeCursor, type TreeCursor } from "../../src/runtime/tree/cursor.js"
import {
  analystRef,
  assistantAddress,
  assistantRef,
  completedResult,
  memoryLayer,
  openWait,
  registrationsFor,
  suspension,
  textPrompt,
} from "./execution/fixtures.js"
import { pinnedTestAgent } from "./run/identity.js"
const encodeJson = <Value>(value: Value): string => Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(value)

testIt("retains the exact active Agent registration closure", () => {
  const required = ExecutableRegistration.requiredPinsForActiveExecutable(assistantRef)
  expect(required).toEqual(ExecutableRegistration.requiredPins(assistantRef))
  expect(required).toEqual(new Set(registrationsFor(assistantRef).map((registration) => registration.pin)))
})

testIt("excludes entries outside the active Agent closure", () => {
  const required = ExecutableRegistration.requiredPinsForActiveExecutable({
    manifest: assistantRef.manifest,
    ref: { ...assistantRef.ref, active: analystRef.ref.active },
  })
  const assistantEntry = assistantRef.manifest.entries.find((entry) => entry.pin === assistantRef.ref.active)!
  const analystEntry = assistantRef.manifest.entries.find((entry) => entry.pin === analystRef.ref.active)!
  expect(required.has(assistantEntry._tag === "Agent" ? assistantEntry.manifest.model : "")).toBe(false)
  expect(required.has(analystEntry._tag === "Agent" ? analystEntry.manifest.model : "")).toBe(true)
  expect(required.size).toBeLessThan(ExecutableRegistration.requiredPins(assistantRef).size)
})

testIt("retains a Program registration closure through Agent capabilities", () => {
  const child = pinnedTestAgent(Agent.make({ name: "program-child" }))
  const program = ProgramManifest.make({
    name: "program",
    source: { language: "javascript", text: "return null" },
    sandbox: Pins.makeCapability({ sandbox: "program" }),
    input: Pins.makeCapability({ codec: "input" }),
    output: Pins.makeCapability({ codec: "output" }),
    capabilities: {
      tools: [],
      steps: [],
      agents: [{ selection: "child", agent: child.pin, input: Pins.makeCapability({ codec: "child-input" }) }],
    },
    budget: {
      agentRuns: 1,
      concurrency: 1,
      toolCalls: 0,
      tokens: 1,
      wallClockMillis: 1,
      logBytes: 1,
      outputBytes: 1,
    },
  })
  const executable = ExecutableManifest.make({
    root: program.pin,
    entries: [
      { _tag: "Program", ...program },
      { _tag: "Agent", ...child },
    ],
  })
  const required = ExecutableRegistration.requiredPinsForActiveExecutable(executable)
  expect(required.has(child.manifest.model)).toBe(true)
  expect(required.has(program.manifest.capabilities.agents[0]!.input)).toBe(true)
})

const blockRootOnChild = (sessionId: string, invocationId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const root = yield* runtime.send({
      to: assistantAddress,
      sessionId,
      idempotencyKey: "root",
      prompt: textPrompt("root"),
    })
    const child = yield* runtime.spawn({
      parentRunId: root.runId,
      invocationId,
      selection: "researcher",
      prompt: textPrompt("child"),
    })
    const childClaim = yield* store.claimExecution({ runId: child.runId, ownerId: "child-worker" })
    yield* store.suspend({
      ...(yield* store.claimExecution({ runId: root.runId, ownerId: "root-worker" })),
      runId: root.runId,
      wait: openWait({ waitId: invocationId }),
      suspension: suspension({ waitId: invocationId }),
    })
    return { runtime, store, root, child, childClaim }
  })

const watchBlocked = (rootRunId: string) =>
  RunTree.watch({ rootRunId, settlement: "root-blocked" }).pipe(
    Stream.runCollect,
    Effect.forkChild({ startImmediately: true }),
  )

layer(memoryLayer)("RunTree", (it) => {
  it.effect("inspects exact active Runs and stable mixed terminal outcomes", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:inspection",
        idempotencyKey: "root",
        prompt: textPrompt("root"),
      })
      const child = yield* runtime.spawn({
        parentRunId: root.runId,
        invocationId: "invoke:child",
        selection: "researcher",
        prompt: textPrompt("child"),
      })
      const grandchild = yield* runtime.spawn({
        parentRunId: child.runId,
        invocationId: "invoke:grandchild",
        selection: "analyst",
        prompt: textPrompt("grandchild"),
      })
      const rootClaim = yield* store.claimExecution({ runId: root.runId, ownerId: "root-worker" })
      yield* store.complete({ ...rootClaim, result: completedResult("root result") })

      const active = yield* RunTree.inspect(root.runId)
      expect(active._tag).toBe("Active")
      if (active._tag !== "Active") return
      expect(active.activeRunIds).toEqual([child.runId, grandchild.runId])
      expect(active.runs.map(({ run }) => run.runId)).toEqual([root.runId, child.runId, grandchild.runId])

      const childClaim = yield* store.claimExecution({ runId: child.runId, ownerId: "child-worker" })
      yield* store.fail({ ...childClaim, error: Errors.AgentExecutionFailure.make({ message: "child failed" }) })
      yield* runtime.cancel({ runId: grandchild.runId, reason: "not needed" })
      const terminal = yield* RunTree.inspect(root.runId)
      expect(terminal._tag).toBe("Terminal")
      expect(terminal.runs.map(({ outcome }) => outcome?._tag)).toEqual(["Succeeded", "Failed", "Cancelled"])
      expect(yield* RunTree.decodeInspection(yield* RunTree.encodeInspection(terminal))).toEqual(terminal)
      expect(yield* RunTree.inspect(root.runId)).toEqual(terminal)
    }),
  )

  it.effect("awaits terminal from an inspection cursor without losing the transition", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:await",
        idempotencyKey: "root",
        prompt: textPrompt("root"),
      })
      const waiting = yield* RunTree.awaitTerminal(root.runId).pipe(Effect.forkChild({ startImmediately: true }))
      const claim = yield* store.claimExecution({ runId: root.runId, ownerId: "await-worker" })
      yield* store.complete({ ...claim, result: completedResult("done") })
      yield* TestClock.adjust("50 millis")
      expect((yield* Fiber.join(waiting))._tag).toBe("Terminal")
    }),
  )

  it.effect("watches a tree until its terminal inspection cursor is drained", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:watch",
        idempotencyKey: "root",
        prompt: textPrompt("root"),
      })
      const watching = yield* RunTree.watch({ rootRunId: root.runId }).pipe(
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      )
      const rootClaim = yield* store.claimExecution({ runId: root.runId, ownerId: "root-worker" })
      yield* store.complete({ ...rootClaim, result: completedResult("root result") })
      yield* TestClock.adjust("50 millis")
      const watched = Array.from(yield* Fiber.join(watching))
      expect(watched.some(({ runId, event }) => runId === root.runId && event._tag === "RunCompleted")).toBe(true)
      expect((yield* RunTree.inspect(root.runId))._tag).toBe("Terminal")
    }),
  )

  it.effect("reads an arbitrary-depth tree in one deterministic projection", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:recursive",
        idempotencyKey: "root",
        prompt: textPrompt("root"),
      })
      const child = yield* runtime.spawn({
        parentRunId: root.runId,
        invocationId: "invoke:child",
        selection: "researcher",
        prompt: textPrompt("child"),
      })
      const grandchild = yield* runtime.spawn({
        parentRunId: child.runId,
        invocationId: "invoke:grandchild",
        selection: "analyst",
        prompt: textPrompt("grandchild"),
      })
      const sibling = yield* runtime.spawn({
        parentRunId: root.runId,
        invocationId: "invoke:sibling",
        selection: "researcher",
        prompt: textPrompt("sibling"),
      })

      const page = yield* RunTree.history({ rootRunId: root.runId, limit: 100 })
      const encodedEvent = yield* RunTree.encodeTreeEvent(page.events[0]!)
      const encodedPage = yield* RunTree.encodeTreePage(page)
      expect(yield* RunTree.decodeTreeEvent(encodedEvent)).toEqual(page.events[0])
      expect(yield* RunTree.decodeTreePage(encodedPage)).toEqual(page)
      const invalidEvent = { ...encodedEvent, event: null }
      const invalidPage = { ...encodedPage, hasMore: null }
      expect(yield* Effect.flip(Schema.decodeUnknownEffect(RunTree.TreeEvent)(invalidEvent))).toBeDefined()
      expect(yield* Effect.flip(Schema.decodeUnknownEffect(RunTree.TreePage)(invalidPage))).toBeDefined()
      expect(page.events.map((entry) => entry.runId)).toContain(grandchild.runId)
      const childAccepted = page.events.find(
        (entry) => entry.runId === child.runId && entry.event._tag === "RunAccepted",
      )!
      expect(childAccepted.rootRunId).toBe(root.runId)
      expect(childAccepted.parentRunId).toBe(root.runId)
      expect(childAccepted.invocationId).toBe("invoke:child")
      const grandchildAccepted = page.events.find(
        (entry) => entry.runId === grandchild.runId && entry.event._tag === "RunAccepted",
      )!
      expect(grandchildAccepted.parentRunId).toBe(child.runId)
      expect(grandchildAccepted.invocationId).toBe("invoke:grandchild")
      expect(new Set(page.events.map((entry) => entry.cursor)).size).toBe(page.events.length)
      expect(page.events.findIndex((entry) => entry.runId === child.runId)).toBeLessThan(
        page.events.findIndex((entry) => entry.runId === sibling.runId),
      )
    }),
  )

  it.effect("projects explicit model and tool call identities", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:calls",
        idempotencyKey: "calls",
        prompt: textPrompt("calls"),
      })
      const claim = yield* store.claimExecution({ runId: root.runId, ownerId: "tree-test" })
      yield* store.emitAgentEvent({
        ...claim,
        event: { _tag: "ToolProgress", turn: 0, toolCallId: "tool:1", message: "working" },
      })
      yield* store.emitAgentEvent({
        ...claim,
        event: {
          _tag: "ModelAttemptStarted",
          deliveryId: "delivery:1",
          turn: 0,
          modelCallId: "model-call:1",
          modelAttemptId: "model-attempt:1",
          attempt: 0,
          startedAt: 0,
        },
      })
      const page = yield* RunTree.history({ rootRunId: root.runId, limit: 100 })
      expect(page.events.find((entry) => entry.event._tag === "ToolProgress")?.toolCallId).toBe("tool:1")
      const attempt = page.events.find((entry) => entry.event._tag === "ModelAttemptStarted")
      expect(attempt?.modelCallId).toBe("model-call:1")
      expect(attempt?.modelAttemptId).toBe("model-attempt:1")
    }),
  )

  it.effect("paginates finite history and resumes an empty tail", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:pages",
        idempotencyKey: "pages",
        prompt: textPrompt("pages"),
      })
      const first = yield* RunTree.history({ rootRunId: root.runId, limit: 1 })
      expect(first.events).toHaveLength(1)
      expect(first.hasMore).toBe(true)
      const second = yield* RunTree.history({ rootRunId: root.runId, cursor: first.cursor, limit: 1 })
      expect(second.events).toHaveLength(1)
      expect(second.hasMore).toBe(false)
      const tail = yield* RunTree.history({ rootRunId: root.runId, cursor: second.cursor, limit: 1 })
      expect(tail.events).toEqual([])
      expect(tail.cursor).toBe(second.cursor)
      expect(tail.hasMore).toBe(false)
    }),
  )

  it.effect("rejects malformed, wrong-root, future, and invalid-limit cursors", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:cursor:first",
        idempotencyKey: "first",
        prompt: textPrompt("first"),
      })
      const second = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:cursor:second",
        idempotencyKey: "second",
        prompt: textPrompt("second"),
      })
      const malformed = RunTree.TreeCursor.make("not-a-cursor")
      expect((yield* Effect.flip(RunTree.history({ rootRunId: first.runId, cursor: malformed, limit: 1 })))._tag).toBe(
        "tenetkit/runtime/TreeCursorInvalid",
      )
      const unsupported = RunTree.TreeCursor.make(
        `tenetkit-tree:${encodeURIComponent(encodeJson({ version: 2, projection: "run-tree", rootRunId: first.runId, position: 0 }))}`,
      )
      expect(
        (yield* Effect.flip(RunTree.history({ rootRunId: first.runId, cursor: unsupported, limit: 1 })))._tag,
      ).toBe("tenetkit/runtime/TreeCursorInvalid")
      const firstPage = yield* RunTree.history({ rootRunId: first.runId, limit: 1 })
      expect(
        (yield* Effect.flip(RunTree.history({ rootRunId: second.runId, cursor: firstPage.cursor, limit: 1 })))._tag,
      ).toBe("tenetkit/runtime/TreeCursorInvalid")
      expect(
        (yield* Effect.flip(
          RunTree.history({ rootRunId: first.runId, cursor: makeTreeCursor(first.runId, 99), limit: 1 }),
        ))._tag,
      ).toBe("tenetkit/runtime/TreeCursorInvalid")
      expect((yield* Effect.flip(RunTree.history({ rootRunId: first.runId, limit: 0 })))._tag).toBe(
        "tenetkit/runtime/TreeCursorInvalid",
      )
    }),
  )

  it.effect("resumes the live stream strictly after a tree cursor", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:live",
        idempotencyKey: "live",
        prompt: textPrompt("live"),
      })
      const history = yield* RunTree.history({ rootRunId: root.runId, limit: 100 })
      const next = yield* RunTree.events({ rootRunId: root.runId, cursor: history.cursor }).pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      )
      const claim = yield* store.claimExecution({ runId: root.runId, ownerId: "tree-live" })
      yield* store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 1 } })
      yield* TestClock.adjust("50 millis")
      yield* store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 2 } })
      yield* TestClock.adjust("50 millis")
      const events = Array.from(yield* Fiber.join(next))
      expect(events.map(({ event }) => (event._tag === "TurnStarted" ? event.turn : undefined))).toEqual([1, 2])
      expect(events[0]?.cursor).not.toBe(history.cursor)
      expect(events[1]?.cursor).not.toBe(events[0]?.cursor)
    }),
  )

  it.effect("settles a root-blocked watch on an open approval wait at the root", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:blocked:approval",
        idempotencyKey: "root",
        prompt: textPrompt("root"),
      })
      yield* store.suspend({
        ...(yield* store.claimExecution({ runId: root.runId, ownerId: "root-worker" })),
        runId: root.runId,
        wait: openWait({ waitId: "approval:root", reason: "approval" }),
        suspension: suspension({ waitId: "approval:root", reason: "approval" }),
      })
      const watched = Array.from(yield* Fiber.join(yield* watchBlocked(root.runId)))
      expect(watched.some(({ runId, event }) => runId === root.runId && event._tag === "RunWaiting")).toBe(true)
      expect((yield* RunTree.inspect(root.runId))._tag).toBe("Active")
    }),
  )

  it.effect("settles a root-blocked watch when a descendant holds an open approval wait", () =>
    Effect.gen(function* () {
      const { child, childClaim, root, store } = yield* blockRootOnChild("tree:blocked:descendant", "invoke:child")
      yield* store.suspend({
        ...childClaim,
        runId: child.runId,
        wait: openWait({ waitId: "approval:child", reason: "approval" }),
        suspension: suspension({ waitId: "approval:child", reason: "approval" }),
      })
      const watched = Array.from(yield* Fiber.join(yield* watchBlocked(root.runId)))
      expect(watched.some(({ runId, event }) => runId === child.runId && event._tag === "RunWaiting")).toBe(true)
    }),
  )

  it.effect("settles a root-blocked watch when a descendant needs operation resolution", () =>
    Effect.gen(function* () {
      const {
        child,
        childClaim: claim,
        root,
        store,
      } = yield* blockRootOnChild("tree:blocked:resolution", "invoke:child")
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey: "tool:unknown",
        kind: "tool",
        inputDigest: "digest",
        input: {},
        replayPolicy: "never",
        attempt: claim.attempt,
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId })
      yield* store.expireRunningOperation({ ...claim, operationId: operation.operationId })
      expect((yield* store.inspect(child.runId)).status).toBe("needs-resolution")
      const watched = Array.from(yield* Fiber.join(yield* watchBlocked(root.runId)))
      expect(watched.some(({ runId }) => runId === child.runId)).toBe(true)
    }),
  )

  it.effect("keeps a root-blocked watch open while a child services the root tool-wait", () =>
    Effect.gen(function* () {
      const { root } = yield* blockRootOnChild("tree:blocked:tool-wait", "invoke:child")
      const watching = yield* watchBlocked(root.runId)
      yield* TestClock.adjust("50 millis")
      yield* TestClock.adjust("50 millis")
      expect(watching.pollUnsafe()).toBeUndefined()
      yield* Fiber.interrupt(watching)
    }),
  )

  it.effect("keeps a root-blocked watch open when the root completes before its child", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:blocked:root-first",
        idempotencyKey: "root",
        prompt: textPrompt("root"),
      })
      const child = yield* runtime.spawn({
        parentRunId: root.runId,
        invocationId: "invoke:child",
        selection: "researcher",
        prompt: textPrompt("child"),
      })
      yield* store.claimExecution({ runId: child.runId, ownerId: "child-worker" })
      const claim = yield* store.claimExecution({ runId: root.runId, ownerId: "root-worker" })
      yield* store.complete({ ...claim, result: completedResult("root result") })
      const watching = yield* watchBlocked(root.runId)
      yield* TestClock.adjust("50 millis")
      yield* TestClock.adjust("50 millis")
      expect(watching.pollUnsafe()).toBeUndefined()
      yield* Fiber.interrupt(watching)
    }),
  )

  it.effect("requires an explicit open wait and an equal cursor before a root-blocked watch settles", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: "tree:blocked:script",
        idempotencyKey: "root",
        prompt: textPrompt("root"),
      })
      yield* store.suspend({
        ...(yield* store.claimExecution({ runId: root.runId, ownerId: "root-worker" })),
        runId: root.runId,
        wait: openWait({ waitId: "gate", reason: "external" }),
        suspension: suspension({ waitId: "gate" }),
      })
      const blocked = yield* RunTree.inspect(root.runId)
      expect(blocked._tag).toBe("Active")
      if (blocked._tag !== "Active") return
      const history = yield* RunTree.history({ rootRunId: root.runId, limit: 100 })
      const first = history.events[0]!
      const second = history.events[1]!
      const early = makeTreeCursor(root.runId, 0)
      const late = makeTreeCursor(root.runId, 1)
      expect(blocked.runs).toHaveLength(1)
      const rootRun = blocked.runs[0]!.run
      const inspectionWith = (wait: RunWait.RunWait | undefined, cursor: TreeCursor): RunTree.Inspection => ({
        ...blocked,
        cursor,
        runs: [
          {
            run:
              wait === undefined
                ? {
                    runId: rootRun.runId,
                    status: rootRun.status,
                    executableRef: rootRun.executableRef,
                    executableManifest: rootRun.executableManifest,
                    depth: rootRun.depth,
                    treePolicy: rootRun.treePolicy,
                    lastSequence: rootRun.lastSequence,
                    durability: rootRun.durability,
                  }
                : {
                    runId: rootRun.runId,
                    status: rootRun.status,
                    executableRef: rootRun.executableRef,
                    executableManifest: rootRun.executableManifest,
                    depth: rootRun.depth,
                    treePolicy: rootRun.treePolicy,
                    lastSequence: rootRun.lastSequence,
                    durability: rootRun.durability,
                    wait,
                  },
          },
        ],
      })
      const pages: ReadonlyArray<RunTree.TreePage> = [
        { events: [first], cursor: early, hasMore: false },
        { events: [], cursor: early, hasMore: false },
        { events: [], cursor: early, hasMore: false },
        { events: [second], cursor: late, hasMore: false },
      ]
      const inspections: ReadonlyArray<RunTree.Inspection> = [
        inspectionWith({ ...openWait({ waitId: "gate", reason: "external" }), status: "responded" }, early),
        inspectionWith(undefined, early),
        inspectionWith(openWait({ waitId: "gate", reason: "external" }), late),
        inspectionWith(openWait({ waitId: "gate", reason: "external" }), late),
      ]
      const reads = yield* Ref.make(0)
      const inspects = yield* Ref.make(0)
      const scripted: Runtime.Interface = {
        ...runtime,
        treeChanges: () =>
          Stream.concat(
            Stream.succeed(undefined),
            Stream.fromSchedule(Schedule.spaced("1 milli")).pipe(Stream.map(() => undefined)),
          ),
        treeHistory: () =>
          Ref.getAndUpdate(reads, (index) => index + 1).pipe(
            Effect.map((index) => pages[index] ?? pages[pages.length - 1]!),
          ),
        inspectTree: () =>
          Ref.getAndUpdate(inspects, (index) => index + 1).pipe(
            Effect.map((index) => inspections[index] ?? inspections[inspections.length - 1]!),
          ),
      }
      const watching = yield* RunTree.watch({ rootRunId: root.runId, settlement: "root-blocked" }).pipe(
        Stream.runCollect,
        Effect.provideService(Runtime.Runtime, scripted),
        Effect.forkChild({ startImmediately: true }),
      )
      yield* TestClock.adjust("3 millis")
      const collected = Array.from(yield* Fiber.join(watching))
      expect(collected.map(({ cursor }) => cursor)).toEqual([first.cursor, second.cursor])
      expect(yield* Ref.get(reads)).toBe(pages.length)
      expect(yield* Ref.get(inspects)).toBe(inspections.length)
    }),
  )
})
