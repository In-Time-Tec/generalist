import { expect, layer } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Errors, Runtime, RunStore, RunTree } from "../src/index.js"
import {
  alternateAssistantAddress,
  alternateResearcherRef,
  assistantAddress,
  completedResult,
  memoryLayer,
  parentRelativeLayer,
  researcherRef,
  textPrompt,
} from "./helpers.js"

layer(memoryLayer)("Runtime children", (it) => {
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
      const before = yield* RunTree.inspect(parent.runId)
      const failure = yield* runtime
        .spawn({
          parentRunId: parent.runId,
          invocationId: "too-late",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        .pipe(Effect.flip)
      expect(failure).toBeInstanceOf(Errors.RunTerminal)
      expect(yield* RunTree.inspect(parent.runId)).toEqual(before)
    }),
  )
})

layer(parentRelativeLayer)("parent-relative child selection", (it) => {
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
      expect(researcherRef.active).not.toBe(alternateResearcherRef.active)
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
      const before = yield* RunTree.inspect(parent.runId)
      const failure = yield* runtime
        .spawn({ parentRunId: parent.runId, invocationId: "missing", selection: "undeclared", prompt: "child" })
        .pipe(Effect.flip)
      expect(failure).toBeInstanceOf(Errors.ChildSelectionMissing)
      expect(yield* RunTree.inspect(parent.runId)).toEqual(before)
    }),
  )
})
