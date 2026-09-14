import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import { Runtime } from "generalist/runtime"
import { layerPeer, layerRoutes } from "generalist/runtime/child-coordination"
import { layerAutoApprove } from "../../../src/core/policy/approvals.js"
import { layerAllowAll } from "../../../src/core/policy/permissions.js"
import { makeObjectStorage } from "../execution/object.js"

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const completed = Stream.make(
  Response.makePart("text-delta", { id: "answer", delta: "done" }),
  Response.makePart("finish", { reason: "stop", usage, response: undefined }),
)

describe("child coordination", () => {
  it.live("routes an external child using only public peer and execution-scope APIs", () =>
    Effect.gen(function* () {
      const child = Agent.make({ name: "remote-child" })
      const parent = Agent.make({ name: "remote-parent", children: ["remote-child"] })
      const agents = { "remote-parent": parent, "remote-child": child }
      const storage = Layer.merge(Layer.succeed(ObjectStore, makeObjectStorage().store), BunCrypto.layer)
      let wakes = 0
      const peer = (partition: string) =>
        layerPeer({
          storage,
          namespace: { environment: "test", tenant: "public-child-coordination", partition },
        })
      const routes = layerRoutes({
        connect: (partition: string) =>
          Effect.succeed(
            partition === "parent" || partition === "child"
              ? Option.some({
                  endpoint: peer(partition),
                  wake: Effect.sync(() => void wakes++),
                })
              : Option.none(),
          ),
      })
      let parentAwaited = false
      let childExecutions = 0
      const executionServices = (scope: Runtime.ExecutionScope<typeof agents>) =>
        Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => {
              if (scope.sessionId !== "external-parent-session") {
                childExecutions++
                return completed
              }
              return Stream.fromEffect(
                Effect.gen(function* () {
                  const receipt = yield* scope.children.start({
                    agent: "remote-child",
                    input: "work",
                    commandId: "remote-child-start",
                    placement: { partition: "child" },
                  })
                  const outcome = yield* scope.children.await(receipt)
                  expect(outcome).toEqual({ _tag: "Succeeded", output: "done" })
                  parentAwaited = true
                }).pipe(Effect.orDie),
              ).pipe(Stream.flatMap(() => completed))
            },
          }),
        )
      const runtime = (partition: string) =>
        Runtime.layer({
          agents,
          revision: "public-child-coordination-v1",
          services: Layer.mergeAll(layerAllowAll, layerAutoApprove, routes),
          executionServices,
          storage,
          namespace: { environment: "test", tenant: "public-child-coordination", partition },
          scheduler: { concurrency: 1, pollInterval: "10 millis" },
        })
      yield* Layer.build(runtime("child"))
      const parentRuntime = yield* Layer.build(runtime("parent")).pipe(
        Effect.map((context) => Context.get(context, Runtime.Runtime)),
      )
      const run = yield* parentRuntime.start(parent, "coordinate", {
        sessionId: "external-parent-session",
        idempotencyKey: "external-parent",
        treePolicy: { maxDepth: 1, maxSessions: 2, concurrency: { agents: 1, tools: 1 } },
      })
      expect(yield* run.await.pipe(Effect.timeout("10 seconds"))).toBe("done")
      expect(parentAwaited).toBe(true)
      expect(childExecutions).toBe(1)
      expect(wakes).toBeGreaterThan(0)
    }).pipe(Effect.scoped),
  )
})
