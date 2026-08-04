import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Response } from "effect/unstable/ai"
import { RunStore, RunTree, Runtime } from "../src/index.js"
import { makeCursor } from "../src/tree-cursor.js"
import { assistantAddress, completedResult, memoryLayer, researcherRef, textPrompt } from "./helpers.js"

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
        agent: researcherRef,
        prompt: textPrompt("child"),
      })
      const grandchild = yield* runtime.spawn({
        parentRunId: child.runId,
        invocationId: "invoke:grandchild",
        agent: researcherRef,
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
      yield* store.fail({ ...childClaim, error: { message: "child failed" } })
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
        agent: researcherRef,
        prompt: textPrompt("child"),
      })
      const grandchild = yield* runtime.spawn({
        parentRunId: child.runId,
        invocationId: "invoke:grandchild",
        agent: researcherRef,
        prompt: textPrompt("grandchild"),
      })
      const sibling = yield* runtime.spawn({
        parentRunId: root.runId,
        invocationId: "invoke:sibling",
        agent: researcherRef,
        prompt: textPrompt("sibling"),
      })

      const page = yield* RunTree.history({ rootRunId: root.runId, limit: 100 })
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
      const toolParts = [
        Response.makePart("tool-params-start", {
          id: "tool:stream",
          name: "search",
          providerExecuted: false,
        }),
        Response.makePart("tool-params-delta", { id: "tool:stream", delta: '{"query":' }),
        Response.makePart("tool-params-end", { id: "tool:stream" }),
        Response.makePart("tool-approval-request", {
          approvalId: "approval:1",
          toolCallId: "tool:approval",
        }),
      ] as const
      yield* Effect.forEach(toolParts, (part) =>
        store.emitAgentEvent({
          ...claim,
          event: {
            _tag: "ModelPart",
            turn: 0,
            modelCallId: "model-call:parts",
            modelAttemptId: "model-attempt:parts",
            attempt: 0,
            part,
          },
        }),
      )
      const page = yield* RunTree.history({ rootRunId: root.runId, limit: 100 })
      expect(page.events.find((entry) => entry.event._tag === "ToolProgress")?.toolCallId).toBe("tool:1")
      const attempt = page.events.find((entry) => entry.event._tag === "ModelAttemptStarted")
      expect(attempt?.modelCallId).toBe("model-call:1")
      expect(attempt?.modelAttemptId).toBe("model-attempt:1")
      const projectedParts = page.events.filter((entry) => entry.event._tag === "ModelPart")
      expect(projectedParts.map((entry) => entry.toolCallId)).toEqual([
        "tool:stream",
        "tool:stream",
        "tool:stream",
        "tool:approval",
      ])
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
        "@batonfx/runtime/TreeCursorInvalid",
      )
      const unsupported = RunTree.TreeCursor.make(
        `baton-tree:${encodeURIComponent(JSON.stringify({ version: 2, projection: "run-tree", rootRunId: first.runId, position: 0 }))}`,
      )
      expect(
        (yield* Effect.flip(RunTree.history({ rootRunId: first.runId, cursor: unsupported, limit: 1 })))._tag,
      ).toBe("@batonfx/runtime/TreeCursorInvalid")
      const firstPage = yield* RunTree.history({ rootRunId: first.runId, limit: 1 })
      expect(
        (yield* Effect.flip(RunTree.history({ rootRunId: second.runId, cursor: firstPage.cursor, limit: 1 })))._tag,
      ).toBe("@batonfx/runtime/TreeCursorInvalid")
      expect(
        (yield* Effect.flip(RunTree.history({ rootRunId: first.runId, cursor: makeCursor(first.runId, 99), limit: 1 })))
          ._tag,
      ).toBe("@batonfx/runtime/TreeCursorInvalid")
      expect((yield* Effect.flip(RunTree.history({ rootRunId: first.runId, limit: 0 })))._tag).toBe(
        "@batonfx/runtime/TreeCursorInvalid",
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
})
