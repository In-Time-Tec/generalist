import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Predicate, Result, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import { Runtime } from "generalist/runtime"
import { RunBudget } from "../../../src/index.js"
import { layerAutoApprove } from "../../../src/core/policy/approvals.js"
import { layerAllowAll } from "../../../src/core/policy/permissions.js"
import { makeObjectStorage } from "./object.js"

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
const completed = Stream.make(Response.makePart("text-delta", { id: "answer", delta: "done" }), finish)

const namespace = {
  environment: "test",
  tenant: "execution-scope",
  partition: "local",
}

const failureTag = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.result,
    Effect.map((result) => {
      expect(Result.isFailure(result)).toBe(true)
      return Result.isFailure(result) &&
        Predicate.hasProperty(result.failure, "_tag") &&
        Predicate.isString(result.failure._tag)
        ? result.failure._tag
        : undefined
    }),
  )

describe("ExecutionScope", () => {
  it.live("derives parentage, preserves exact retries, and rejects foreign authority", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      let writes = 0
      const instrumented: typeof storage.store = {
        ...storage.store,
        create: (key, bytes) => {
          writes += 1
          return storage.store.create(key, bytes)
        },
      }
      const gateA = yield* Deferred.make<void>()
      const gateB = yield* Deferred.make<void>()
      const gateChild = yield* Deferred.make<void>()
      const waitingA = yield* Deferred.make<void>()
      const waitingB = yield* Deferred.make<void>()
      const waitingChild = yield* Deferred.make<void>()
      const scopeA = yield* Deferred.make<Runtime.ExecutionScope<Registry>>()
      const scopeB = yield* Deferred.make<Runtime.ExecutionScope<Registry>>()
      const finalizations = new Map<string, number>()
      const runtimes = new Map<string, Runtime.Service>()
      const worker = Agent.make({ name: "worker" })
      const reviewer = Agent.make({ name: "reviewer" })
      const coordinator = Agent.make({ name: "coordinator", children: ["worker", "reviewer"] })
      const agents = { coordinator, worker, reviewer }
      type Registry = typeof agents
      const executionServices = (scope: Runtime.ExecutionScope<Registry>) =>
        Layer.effect(
          LanguageModel.LanguageModel,
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            runtimes.set(scope.runId, runtime)
            if (scope.sessionId === "scope-a") yield* Deferred.succeed(scopeA, scope)
            if (scope.sessionId === "scope-b") yield* Deferred.succeed(scopeB, scope)
            return yield* Effect.acquireRelease(
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () => {
                  let gate = gateChild
                  let waiting = waitingChild
                  if (scope.sessionId === "scope-a") {
                    gate = gateA
                    waiting = waitingA
                  } else if (scope.sessionId === "scope-b") {
                    gate = gateB
                    waiting = waitingB
                  }
                  return Stream.fromEffect(
                    Deferred.succeed(waiting, undefined).pipe(Effect.andThen(Deferred.await(gate))),
                  ).pipe(Stream.flatMap(() => completed))
                },
              }),
              () =>
                Effect.sync(() => {
                  finalizations.set(scope.runId, (finalizations.get(scope.runId) ?? 0) + 1)
                }),
            )
          }),
        )
      const runtime = yield* Layer.build(
        Runtime.layer({
          agents,
          revision: "execution-scope-v1",
          services: Layer.merge(layerAllowAll, layerAutoApprove),
          executionServices,
          storage: Layer.merge(Layer.succeed(ObjectStore, instrumented), BunCrypto.layer),
          namespace,
          scheduler: { concurrency: 4, pollInterval: "10 millis" },
        }),
      ).pipe(Effect.map((context) => Context.get(context, Runtime.Runtime)))

      const parentA = yield* runtime.start(coordinator, "coordinate a", {
        sessionId: "scope-a",
        idempotencyKey: "scope-parent-a",
      })
      const parentB = yield* runtime.start(coordinator, "coordinate b", {
        sessionId: "scope-b",
        idempotencyKey: "scope-parent-b",
        budget: RunBudget.make({ children: 0 }),
      })
      const firstScope = yield* Deferred.await(scopeA)
      const secondScope = yield* Deferred.await(scopeB)
      yield* Deferred.await(waitingA)
      yield* Deferred.await(waitingB)
      expect(runtimes.get(parentA.runId)).toBe(runtime)
      expect(runtimes.get(parentB.runId)).toBe(runtime)
      expect(
        yield* failureTag(
          secondScope.children.start({ agent: "worker", input: "budgeted", commandId: "budgeted-child" }),
        ),
      ).toBe("generalist/core/RunBudgetExhausted")

      const first = yield* firstScope.children.start({
        agent: "worker",
        input: "one",
        commandId: "child-command",
      })
      yield* Deferred.await(waitingChild)
      const writesAfterFirstAdmission = writes
      const retry = yield* firstScope.children.start({
        agent: "worker",
        input: "one",
        commandId: "child-command",
      })
      expect(first).toMatchObject({
        agent: "worker",
        placement: { partition: "local" },
        duplicate: false,
      })
      expect(retry).toEqual(first)
      expect(writes).toBe(writesAfterFirstAdmission)
      expect(
        yield* failureTag(firstScope.children.start({ agent: "worker", input: "changed", commandId: "child-command" })),
      ).toBe("generalist/runtime/ChildCommandConflict")
      expect(
        yield* failureTag(firstScope.children.start({ agent: "reviewer", input: "one", commandId: "child-command" })),
      ).toBe("generalist/runtime/ChildCommandConflict")
      expect(
        yield* failureTag(
          firstScope.children.start({
            agent: "worker",
            input: "one",
            commandId: "child-command",
            placement: { partition: "remote" },
          }),
        ),
      ).toBe("generalist/runtime/ChildCommandConflict")
      expect(
        yield* failureTag(
          firstScope.children.start({
            agent: "worker",
            input: "remote",
            commandId: "remote-command",
            placement: { partition: "remote" },
          }),
        ),
      ).toBe("generalist/runtime/ChildPlacementDenied")

      const inspected = yield* firstScope.children.inspect(first.childRunId)
      expect(inspected).toMatchObject({
        childRunId: first.childRunId,
        sessionId: first.sessionId,
        agent: "worker",
        placement: { partition: "local" },
      })
      expect(inspected.invocationId).toContain("execution-scope:")
      expect((yield* firstScope.children.list).map((child) => child.childRunId)).toContain(first.childRunId)
      yield* Deferred.succeed(gateChild, undefined)
      expect(yield* firstScope.children.await(first)).toEqual({ _tag: "Succeeded", output: "done" })
      const siblings = yield* Effect.all(
        [
          firstScope.children.start({ agent: "worker", input: "sibling one", commandId: "sibling-one" }),
          firstScope.children.start({ agent: "reviewer", input: "sibling two", commandId: "sibling-two" }),
        ],
        { concurrency: "unbounded" },
      )
      expect(new Set(siblings.map((receipt) => receipt.childRunId)).size).toBe(2)
      expect(yield* Effect.all(siblings.map((receipt) => firstScope.children.await(receipt)))).toEqual([
        { _tag: "Succeeded", output: "done" },
        { _tag: "Succeeded", output: "done" },
      ])
      expect(yield* failureTag(secondScope.children.inspect(first.childRunId))).toBe("generalist/runtime/RunNotFound")
      expect(yield* failureTag(secondScope.children.await(first))).toBe("generalist/runtime/RunNotFound")
      expect(yield* failureTag(secondScope.children.cancel(first, { commandId: "foreign-cancel" }))).toBe(
        "generalist/runtime/RunNotFound",
      )
      // SAFETY: this intentional assertion exercises runtime rejection of a structurally copied nominal receipt.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const copied = { ...first } as typeof first
      expect(yield* failureTag(firstScope.children.await(copied))).toBe("generalist/runtime/RunNotFound")

      yield* Deferred.succeed(gateA, undefined)
      yield* Deferred.succeed(gateB, undefined)
      expect(yield* parentA.await).toBe("done")
      expect(yield* parentB.await).toBe("done")
      yield* Effect.sleep("25 millis")
      expect(finalizations.get(parentA.runId)).toBe(1)
      expect(finalizations.get(parentB.runId)).toBe(1)

      const beforeStaleCalls = writes
      const stale = [
        firstScope.children.list,
        firstScope.children.inspect(first.childRunId),
        firstScope.children.await(first),
        firstScope.children.cancel(first, { commandId: "stale-cancel" }),
        firstScope.children.start({ agent: "worker", input: "stale", commandId: "stale-start" }),
      ] as const
      for (const method of stale) {
        expect(yield* failureTag(method)).toBe("generalist/runtime/ExecutionScopeRetired")
      }
      expect(writes).toBe(beforeStaleCalls)
    }).pipe(Effect.scoped),
  )

  it.live("cancels an active local child with exact retry semantics", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      let writes = 0
      const instrumented: typeof storage.store = {
        ...storage.store,
        create: (key, bytes) => {
          writes += 1
          return storage.store.create(key, bytes)
        },
      }
      const child = Agent.make({ name: "cancel-child" })
      const parent = Agent.make({ name: "cancel-parent", children: ["cancel-child"] })
      const agents = { "cancel-parent": parent, "cancel-child": child }
      const issued = yield* Deferred.make<Runtime.ExecutionScope<typeof agents>>()
      const executionServices = (scope: Runtime.ExecutionScope<typeof agents>) =>
        Layer.effect(
          LanguageModel.LanguageModel,
          Effect.gen(function* () {
            if (scope.sessionId === "cancel-parent-session") yield* Deferred.succeed(issued, scope)
            return yield* LanguageModel.make({
              generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
              streamText: () => Stream.never,
            })
          }),
        )
      const runtime = yield* Layer.build(
        Runtime.layer({
          agents,
          revision: "execution-scope-cancel-v1",
          services: Layer.merge(layerAllowAll, layerAutoApprove),
          executionServices,
          storage: Layer.merge(Layer.succeed(ObjectStore, instrumented), BunCrypto.layer),
          namespace: { ...namespace, tenant: "execution-scope-cancel" },
          scheduler: { concurrency: 2, pollInterval: "10 millis" },
        }),
      ).pipe(Effect.map((context) => Context.get(context, Runtime.Runtime)))
      yield* runtime.start(parent, "wait", {
        sessionId: "cancel-parent-session",
        idempotencyKey: "cancel-parent",
      })
      const scope = yield* Deferred.await(issued)
      const receipt = yield* scope.children.start({
        agent: "cancel-child",
        input: "wait",
        commandId: "cancel-child-start",
      })

      let childIsActive = false
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const inspection = yield* scope.children.inspect(receipt.childRunId)
        if (inspection.status === "running") {
          childIsActive = true
          break
        }
        yield* Effect.sleep("10 millis")
      }
      expect(childIsActive).toBe(true)

      yield* scope.children.cancel(receipt, { commandId: "cancel-command", reason: "cancelled by parent" })
      expect(yield* scope.children.await(receipt)).toEqual({ _tag: "Cancelled", reason: "cancelled by parent" })
      const writesAfterCancellation = writes
      yield* scope.children.cancel(receipt, { commandId: "cancel-command", reason: "cancelled by parent" })
      expect(writes).toBe(writesAfterCancellation)
      expect(
        yield* failureTag(
          scope.children.cancel(receipt, { commandId: "cancel-command", reason: "changed cancellation" }),
        ),
      ).toBe("generalist/runtime/ChildCommandConflict")
    }).pipe(Effect.scoped),
  )
})
