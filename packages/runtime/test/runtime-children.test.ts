import { expect, layer } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Runtime, RunStore, RunTree } from "../src/index.js"
import { assistantAddress, completedResult, memoryLayer, researcherRef, textPrompt } from "./helpers.js"

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
        agent: researcherRef,
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
        agent: researcherRef,
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
})
