import { expect, layer } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { ChildRuns, Cursor, Errors, Runtime, RunStore, RunTree } from "../../../src/runtime/index.js"
import {
  alternateAssistantAddress,
  alternateResearcherRef,
  assistantAddress,
  completedResult,
  memoryLayer,
  parentRelativeLayer,
  researcherRef,
  textPrompt,
} from "../execution/fixtures.js"

layer(memoryLayer)("Runtime children", (it) => {
  it.effect("isolates each spawned child's Session from its parent and its siblings", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "thread:isolation",
        idempotencyKey: "isolation-parent",
        prompt: textPrompt("plan"),
      })
      const first = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "invocation:title",
        selection: "researcher",
        prompt: textPrompt("name the thread"),
      })
      const second = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "invocation:task",
        selection: "researcher",
        prompt: textPrompt("do the task"),
      })
      const replayed = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "invocation:title",
        selection: "researcher",
        prompt: textPrompt("name the thread"),
      })

      const sessionOf = (runId: string) =>
        store.loadExecution(runId).pipe(Effect.map((execution) => execution.message.sessionId))

      const parentSession = yield* sessionOf(parent.runId)
      const firstSession = yield* sessionOf(first.runId)
      const secondSession = yield* sessionOf(second.runId)

      // A subagent works in isolation, so it must not inherit the thread's conversation.
      expect(firstSession).not.toBe(parentSession)
      expect(secondSession).not.toBe(parentSession)
      // Siblings are separate conversations.
      expect(firstSession).not.toBe(secondSession)
      // A replayed spawn reattaches instead of stranding the first attempt's work.
      expect(replayed.runId).toBe(first.runId)
      expect(yield* sessionOf(replayed.runId)).toBe(firstSession)
    }),
  )

  it.effect("links a child on the parent and keeps child detail on the child stream", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:child",
        idempotencyKey: "parent",
        prompt: textPrompt("plan"),
      })
      const child = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "invocation:research",
        selection: "researcher",
        prompt: textPrompt("research"),
      })
      const duplicate = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "invocation:research",
        selection: "researcher",
        prompt: textPrompt("research"),
      })
      expect(duplicate.runId).toBe(child.runId)
      expect(duplicate.duplicate).toBe(true)
      yield* driver.emitAgentEvent({
        ...(yield* driver.claimExecution({ runId: child.runId, ownerId: "test" })),
        runId: child.runId,
        event: { _tag: "TurnStarted", turn: 0 },
      })
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: child.runId, ownerId: "test" })),
        runId: child.runId,
        result: completedResult("notes"),
      })

      const parentInspection = yield* runtime.inspect(parent.runId)
      const parentTags = yield* runtime.events({ runId: parent.runId }).pipe(
        Stream.take(parentInspection.lastSequence + 1),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(parentTags).toContain("ChildLinked")
      expect(parentTags).toContain("ChildSettled")
      expect(parentTags).not.toContain("TurnStarted")
      expect(
        (yield* runtime.history({ runId: parent.runId, limit: 100 })).find((event) => event._tag === "ChildLinked"),
      ).toMatchObject({
        childRunId: child.runId,
        invocationId: "invocation:research",
        selection: "researcher",
        prompt: textPrompt("research"),
      })

      const childInspectionBefore = yield* runtime.inspect(child.runId)
      const childTags = yield* runtime.events({ runId: child.runId }).pipe(
        Stream.take(childInspectionBefore.lastSequence + 1),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(childTags).toContain("TurnStarted")
      expect(childTags.at(-1)).toBe("RunCompleted")

      const childInspection = yield* runtime.inspect(child.runId)
      expect(childInspection.executableRef).toEqual(researcherRef.ref)
      expect(childInspection.parentRunId).toBe(parent.runId)
      expect(childInspection.status).toBe("succeeded")
      expect(parentInspection.status).toBe("running")
    }),
  )

  it.effect("projects a noncanonical tree view over parent and child streams", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:tree",
        idempotencyKey: "parent",
        prompt: textPrompt("plan"),
      })
      const child = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "invocation:research",
        selection: "researcher",
        prompt: textPrompt("research"),
      })
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: child.runId, ownerId: "test" })),
        runId: child.runId,
        result: completedResult("notes"),
      })
      const tree = yield* RunTree.events({ rootRunId: parent.runId }).pipe(
        Stream.take(6),
        Stream.runCollect,
        Effect.map((chunk) => Array.from(chunk)),
      )
      expect(tree.some((item) => item.runId === parent.runId && item.event._tag === "ChildLinked")).toBe(true)
      expect(tree.some((item) => item.runId === child.runId && item.event._tag === "RunCompleted")).toBe(true)
    }),
  )

  it.effect("attributes root cancellation to every owned child before the root reports terminal", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:cancel-tree",
        idempotencyKey: "parent",
        prompt: textPrompt("plan"),
      })
      const first = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "invocation:one",
        selection: "researcher",
        prompt: textPrompt("one"),
      })
      const second = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "invocation:two",
        selection: "researcher",
        prompt: textPrompt("two"),
      })

      yield* runtime.cancel({ runId: parent.runId, reason: "stop" })

      expect((yield* runtime.inspect(first.runId)).status).toBe("cancelled")
      expect((yield* runtime.inspect(second.runId)).status).toBe("cancelled")
      expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")

      for (const child of [first, second]) {
        const events = yield* driver.history({ runId: child.runId, cursor: Cursor.origin, limit: 100 })
        const cancelled = events.find((event) => event._tag === "RunCancelled")
        expect(cancelled).toBeDefined()
        expect(cancelled!.runId).toBe(child.runId)
        expect(cancelled).toMatchObject({ reason: "stop" })
      }

      const tree = yield* RunTree.replay({ rootRunId: parent.runId, limit: 200 })
      const cancelledRunIds = tree.events.filter((item) => item.event._tag === "RunCancelled").map((item) => item.runId)
      expect(new Set(cancelledRunIds)).toEqual(new Set([parent.runId, first.runId, second.runId]))
      expect(cancelledRunIds.indexOf(parent.runId)).toBe(cancelledRunIds.length - 1)
    }),
  )

  it.effect("rejects child admission after the parent is terminal and leaves the tree stable", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:terminal-parent",
        idempotencyKey: "parent",
        prompt: textPrompt("parent"),
      })
      const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "test" })
      yield* store.complete({ ...claim, result: completedResult("done") })
      const before = yield* RunTree.checkpoint(parent.runId)
      const failure = yield* runtime
        .spawn({
          parentRunId: parent.runId,
          invocationId: "too-late",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        .pipe(Effect.flip)
      expect(failure).toBeInstanceOf(Errors.RunTerminal)
      expect(yield* RunTree.checkpoint(parent.runId)).toEqual(before)
    }),
  )
})

layer(parentRelativeLayer)("parent-relative child selection", (it) => {
  it.effect("replays model-facing child admission and joins the persisted result", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "relative:tool-child",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      yield* store.claimExecution({ runId: parent.runId, ownerId: "test-parent" })
      const children = ChildRuns.make(store)
      const input = {
        parentRunId: parent.runId,
        toolCallId: "child-call",
        selection: "researcher",
        label: "Research card",
        prompt: "research",
      }
      const first = yield* children.invoke(input)
      const replay = yield* children.invoke(input)
      expect(first._tag).toBe("Suspend")
      expect(replay).toEqual(first)
      if (first._tag !== "Suspend") return
      const large = "終🚀".repeat(7_000)
      yield* store.complete({
        ...(yield* store.claimExecution({ runId: first.token, ownerId: "test" })),
        result: completedResult(large),
      })
      expect(yield* children.invoke(input)).toMatchObject({
        _tag: "Success",
        result: { _tag: "Succeeded", childRunId: first.token, label: "Research card", text: large },
      })
    }),
  )

  it.effect("resolves the same selection independently in two executable closures", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "relative:first",
        idempotencyKey: "parent",
        prompt: "first",
      })
      const second = yield* runtime.send({
        to: alternateAssistantAddress,
        sessionId: "relative:second",
        idempotencyKey: "parent",
        prompt: "second",
      })
      const firstChild = yield* runtime.spawn({
        parentRunId: first.runId,
        invocationId: "child",
        selection: "researcher",
        prompt: "child",
      })
      const secondChild = yield* runtime.spawn({
        parentRunId: second.runId,
        invocationId: "child",
        selection: "researcher",
        prompt: "child",
      })
      expect((yield* runtime.inspect(firstChild.runId)).executableRef).toEqual(researcherRef.ref)
      expect((yield* runtime.inspect(secondChild.runId)).executableRef).toEqual(alternateResearcherRef.ref)
      expect(researcherRef.ref.active).not.toBe(alternateResearcherRef.ref.active)
    }),
  )

  it.effect("rejects an undeclared selection without changing the run tree", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "relative:missing",
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const before = yield* RunTree.checkpoint(parent.runId)
      const failure = yield* runtime
        .spawn({ parentRunId: parent.runId, invocationId: "missing", selection: "undeclared", prompt: "child" })
        .pipe(Effect.flip)
      expect(failure).toBeInstanceOf(Errors.ChildSelectionMissing)
      expect(yield* RunTree.checkpoint(parent.runId)).toEqual(before)
    }),
  )
})
