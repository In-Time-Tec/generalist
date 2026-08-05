import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { ChildRuns, LocalScheduler, Runtime, RunStore } from "../src/index.js"
import {
  assistant,
  assistantAddress,
  assistantRef,
  completedResult,
  openWait,
  registrationsFor,
  researcher,
  researcherRef,
  suspension,
} from "./helpers.js"
import { Agent } from "@batonfx/core"
import { closedTestAgent } from "./identity.js"
import { makeStatic } from "../src/executable-resolver.js"
import { tempDbPath } from "./sqlite-helpers.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

for (const backend of ["memory", "sqlite"] as const) {
  it.effect(`${backend} local scheduler executes admitted roots and children`, () => {
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "answer", delta: "done" }),
            finish,
          ]),
      }),
    )
    const options = {
      resolver: makeStatic([
        { executable: assistantRef, agent: Agent.close(assistant, model) },
        { executable: researcherRef, agent: Agent.close(researcher, model) },
      ]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler") })

    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const scheduler = yield* LocalScheduler.LocalScheduler
      const store = yield* RunStore.RunStore
      const root = yield* runtime.send({
        to: assistantAddress,
        sessionId: `scheduler:${backend}`,
        idempotencyKey: "root",
        prompt: "root",
      })
      yield* scheduler.tick
      const rootSnapshot = yield* runtime.snapshot(root.runId)
      if (rootSnapshot.outcome?._tag === "Failed") return yield* Effect.die(rootSnapshot.outcome.error)
      expect(rootSnapshot.run.status).toBe("succeeded")
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: `scheduler-child:${backend}`,
        idempotencyKey: "parent",
        prompt: "parent",
      })
      yield* store.claimExecution({ runId: parent.runId, ownerId: "manual-parent" })
      const child = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "research",
        selection: "researcher",
        prompt: "child",
      })
      yield* scheduler.tick
      expect((yield* runtime.inspect(child.runId)).status).toBe("succeeded")
    }).pipe(Effect.provide(runtimeLayer), Effect.scoped)
  })

  it.effect(`${backend} local scheduler reconciles an orphaned cancelling tree root last`, () => {
    const options = {
      resolver: makeStatic([
        { executable: assistantRef, agent: closedTestAgent(assistant) },
        { executable: researcherRef, agent: closedTestAgent(researcher) },
      ]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-cancel") })

    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const scheduler = yield* LocalScheduler.LocalScheduler
      const store = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: `scheduler-cancel:${backend}`,
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "orphan-parent" })
      const childOutcome = yield* ChildRuns.make(store).invoke({
        parentRunId: parent.runId,
        toolCallId: "child-tool",
        selection: "researcher",
        prompt: "child",
      })
      if (childOutcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
      yield* store.suspend({
        ...parentClaim,
        wait: openWait("child-tool"),
        suspension: suspension("child-tool"),
      })
      yield* store.complete({
        ...(yield* store.claimExecution({ runId: childOutcome.token, ownerId: "finished-child" })),
        result: completedResult("done"),
      })
      const blocker = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "blocker",
        selection: "researcher",
        prompt: "block",
      })
      yield* store.claimExecution({ runId: blocker.runId, ownerId: "orphan-child" })

      yield* runtime.cancel({ runId: parent.runId, reason: "stop" })
      expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelling")
      yield* scheduler.tick
      yield* scheduler.tick

      expect((yield* runtime.inspect(blocker.runId)).status).toBe("cancelled")
      expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")
      const history = yield* runtime.history({ runId: parent.runId, cursor: -1, limit: 100 })
      const tags = history.map((event) => event._tag)
      expect(tags.slice(tags.indexOf("RunCancellationRequested") + 1)).not.toContain("RunResumed")
      expect(tags.filter((tag) => tag === "RunCancelled")).toHaveLength(1)
      const tree = yield* runtime.treeHistory({ rootRunId: parent.runId, limit: 100 })
      const cancelled = tree.events.filter((entry) => entry.event._tag === "RunCancelled").map((entry) => entry.runId)
      expect(cancelled[cancelled.length - 1]).toBe(parent.runId)

      const activeParent = yield* runtime.send({
        to: assistantAddress,
        sessionId: `scheduler-active-cancel:${backend}`,
        idempotencyKey: "parent",
        prompt: "parent",
      })
      yield* store.claimExecution({ runId: activeParent.runId, ownerId: "orphan-active-parent" })
      const activeChild = yield* runtime.spawn({
        parentRunId: activeParent.runId,
        invocationId: "child",
        selection: "researcher",
        prompt: "child",
      })
      yield* store.claimExecution({ runId: activeChild.runId, ownerId: "orphan-active-child" })
      yield* runtime.cancel({ runId: activeParent.runId, reason: "stop" })
      expect((yield* runtime.inspect(activeParent.runId)).status).toBe("cancelling")

      yield* scheduler.tick
      expect((yield* runtime.inspect(activeChild.runId)).status).toBe("cancelled")
      expect((yield* runtime.inspect(activeParent.runId)).status).toBe("cancelled")
      const activeTree = yield* runtime.treeHistory({ rootRunId: activeParent.runId, limit: 100 })
      const activeCancelled = activeTree.events
        .filter((entry) => entry.event._tag === "RunCancelled")
        .map((entry) => entry.runId)
      expect(activeCancelled).toEqual([activeChild.runId, activeParent.runId])
    }).pipe(Effect.provide(runtimeLayer), Effect.scoped)
  })

  it.effect(`${backend} overlapping scheduler ticks do not reclaim an active local Run`, () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      let requests = 0
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: () => {
            requests += 1
            return Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
              Stream.drain,
              Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
              Stream.concat(Stream.make(Response.makePart("text-delta", { id: "answer", delta: "done" }), finish)),
            )
          },
        }),
      )
      const options = {
        resolver: makeStatic([{ executable: assistantRef, agent: Agent.close(assistant, model) }]),
        addresses: [
          { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
        ],
        scheduler: { pollInterval: "1 day" as const },
      }
      const runtimeLayer =
        backend === "memory"
          ? Runtime.layerMemory(options)
          : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-active") })

      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: `scheduler-active:${backend}`,
          idempotencyKey: "run",
          prompt: "run",
        })
        const first = yield* scheduler.tick.pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        const activeFence = (yield* store.loadExecution(receipt.runId)).attemptFence
        const second = yield* scheduler.tick.pipe(Effect.forkChild({ startImmediately: true }))
        yield* Effect.yieldNow

        expect((yield* store.loadExecution(receipt.runId)).attemptFence).toBe(activeFence)
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(first)
        yield* Fiber.join(second)
        expect(requests).toBe(1)
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
      }).pipe(Effect.provide(runtimeLayer), Effect.scoped)
    }),
  )

  it.effect(`${backend} the cancelling sweep never settles an owned but unregistered claim`, () => {
    const options = {
      resolver: makeStatic([
        { executable: assistantRef, agent: closedTestAgent(assistant) },
        { executable: researcherRef, agent: closedTestAgent(researcher) },
      ]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-claim-window") })

    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const scheduler = yield* LocalScheduler.LocalScheduler
      const store = yield* RunStore.RunStore
      const workerId = backend === "memory" ? "memory" : "sqlite"

      const owned = yield* runtime.send({
        to: assistantAddress,
        sessionId: `scheduler-claim-window:${backend}`,
        idempotencyKey: "owned",
        prompt: "owned",
      })
      yield* store.claimExecution({ runId: owned.runId, ownerId: workerId })
      yield* runtime.cancel({ runId: owned.runId, reason: "stop" })
      expect((yield* runtime.inspect(owned.runId)).status).toBe("cancelling")

      const orphaned = yield* runtime.send({
        to: assistantAddress,
        sessionId: `scheduler-claim-window-ghost:${backend}`,
        idempotencyKey: "ghost",
        prompt: "ghost",
      })
      yield* store.claimExecution({ runId: orphaned.runId, ownerId: "ghost-owner" })
      yield* runtime.cancel({ runId: orphaned.runId, reason: "stop" })

      yield* scheduler.tick

      expect((yield* runtime.inspect(owned.runId)).status).toBe("cancelling")
      const fenceBefore = (yield* store.loadExecution(owned.runId)).attemptFence
      const ownedExecution = yield* store.loadExecution(owned.runId)
      expect(ownedExecution.ownerId).toBe(workerId)
      expect(ownedExecution.attemptFence).toBe(fenceBefore)
      const ownedTags = (yield* runtime.history({ runId: owned.runId, cursor: -1, limit: 100 })).map(
        (event) => event._tag,
      )
      expect(ownedTags).not.toContain("RunCancelled")
      expect((yield* runtime.inspect(orphaned.runId)).status).toBe("cancelled")
    }).pipe(Effect.provide(runtimeLayer), Effect.scoped)
  })

  it.effect(`${backend} scheduler selection claims the oldest ready Runs beyond the window`, () => {
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "answer", delta: "done" }),
            finish,
          ]),
      }),
    )
    const options = {
      resolver: makeStatic([{ executable: assistantRef, agent: Agent.close(assistant, model) }]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const, concurrency: 4 },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-fifo") })

    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const scheduler = yield* LocalScheduler.LocalScheduler
      const receipts: Array<{ readonly runId: string }> = []
      for (let index = 0; index < 17; index += 1) {
        receipts.push(
          yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-fifo:${backend}:${index}`,
            idempotencyKey: `fifo-${index}`,
            prompt: `run-${index}`,
          }),
        )
      }
      for (let tickIndex = 0; tickIndex < 5; tickIndex += 1) {
        yield* scheduler.tick
        const completed = yield* Effect.forEach(
          receipts,
          (receipt) =>
            runtime.inspect(receipt.runId).pipe(Effect.map((inspection) => inspection.status === "succeeded")),
          { concurrency: "unbounded" },
        )
        const expected = Math.min(4 * (tickIndex + 1), 17)
        if (backend === "memory") {
          expect(completed).toEqual([
            ...Array<boolean>(expected).fill(true),
            ...Array<boolean>(17 - expected).fill(false),
          ])
        } else {
          expect(completed.filter(Boolean)).toHaveLength(expected)
        }
      }
      expect((yield* runtime.inspect(receipts[0]!.runId)).status).toBe("succeeded")
      expect((yield* runtime.inspect(receipts[16]!.runId)).status).toBe("succeeded")
    }).pipe(Effect.provide(runtimeLayer), Effect.scoped)
  })

  it.effect(
    `${backend} terminal reconciliation stays bounded past the query window`,
    () => {
      const options = {
        resolver: makeStatic([
          { executable: assistantRef, agent: closedTestAgent(assistant) },
          { executable: researcherRef, agent: closedTestAgent(researcher) },
        ]),
        addresses: [
          { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
        ],
        scheduler: { pollInterval: "1 day" as const },
      }
      const runtimeLayer =
        backend === "memory"
          ? Runtime.layerMemory(options)
          : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-bounded") })

      return Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        const store = yield* RunStore.RunStore
        const runCount = backend === "memory" ? 1000 : 400
        const receipts: Array<{ readonly runId: string }> = []
        for (let index = 0; index < runCount; index += 1) {
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-bounded:${backend}:${index}`,
            idempotencyKey: `bounded-${index}`,
            prompt: `run-${index}`,
          })
          receipts.push(receipt)
        }
        for (const receipt of receipts) {
          const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "bounded-worker" })
          yield* store.complete({ ...claim, result: completedResult("done") })
        }
        const calls: Array<{ readonly method: string; readonly input: Record<string, unknown> }> = []
        const spy = RunStore.RunStore.of({
          ...store,
          list: (input) => {
            calls.push({ method: "list", input: { ...input } })
            return store.list(input)
          },
          loadExecution: (runId) => {
            calls.push({ method: "loadExecution", input: { runId } })
            return store.loadExecution(runId)
          },
          snapshot: (runId) => {
            calls.push({ method: "snapshot", input: { runId } })
            return store.snapshot(runId)
          },
        })
        for (const tickIndex of [0, 1]) {
          const before = calls.length
          yield* scheduler.tick.pipe(Effect.provideService(RunStore.RunStore, spy))
          const tickCalls = calls.slice(before)
          expect(tickCalls.length).toBe(8)
          for (const call of tickCalls) {
            expect(call.input.limit).toBeLessThanOrEqual(64)
          }
          const terminalListCalls = tickCalls.filter(
            (call) =>
              call.method === "list" && ["succeeded", "failed", "cancelled"].includes(String(call.input.status)),
          )
          expect(terminalListCalls.every((call) => call.input.limit === 32)).toBe(true)
          if (tickIndex === 1) {
            const progressed = tickCalls.filter((call) => call.method === "list" && call.input.afterRunId !== undefined)
            expect(progressed.length).toBeGreaterThanOrEqual(1)
            expect(progressed.every((call) => call.input.status === "succeeded")).toBe(true)
          }
        }
        expect(calls.filter((call) => call.method === "loadExecution")).toHaveLength(0)
        expect(calls.filter((call) => call.method === "snapshot")).toHaveLength(0)
      }).pipe(Effect.provide(runtimeLayer), Effect.scoped)
    },
    120_000,
  )

  it.effect(`${backend} scheduler resumes a waiting parent once its child settles`, () => {
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "answer", delta: "done" }),
            finish,
          ]),
      }),
    )
    const options = {
      resolver: makeStatic([
        { executable: assistantRef, agent: Agent.close(assistant, model) },
        { executable: researcherRef, agent: Agent.close(researcher, model) },
      ]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-resume") })

    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const scheduler = yield* LocalScheduler.LocalScheduler
      const store = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: `scheduler-resume:${backend}`,
        idempotencyKey: "parent",
        prompt: "parent",
      })
      const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "manual-parent" })
      const outcome = yield* ChildRuns.make(store).invoke({
        parentRunId: parent.runId,
        toolCallId: "child-tool",
        selection: "researcher",
        prompt: "child",
      })
      if (outcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
      yield* store.suspend({
        ...parentClaim,
        wait: openWait("child-tool"),
        suspension: suspension("child-tool"),
      })
      yield* scheduler.tick
      expect((yield* runtime.inspect(outcome.token)).status).toBe("succeeded")
      yield* scheduler.tick
      const parentInspection = yield* runtime.inspect(parent.runId)
      expect(parentInspection.wait?.waitId).toBe("child-tool")
      expect(parentInspection.wait?.status).toBe("responded")
    }).pipe(Effect.provide(runtimeLayer), Effect.scoped)
  })
}
