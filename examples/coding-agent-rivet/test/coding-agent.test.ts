import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { activate, layer as layerDurability } from "generalist/durability"
import { AgentDirectory, LocalScheduler, Runtime } from "generalist/runtime"
import { layer as layerSimulator, make as makeSimulator, type Client } from "generalist/testing/durability"
import { key, make as makeCodingAgentActor, namespaceFromActorKey } from "../src/actor.js"
import { make as makeCommand, treePolicy } from "../src/command.js"
import type { CodingAgentConfig } from "../src/config.js"
import { addressBindings, resolverLayer } from "../src/executable.js"
import { sendSpecialistNote } from "../src/messaging.js"
import { make } from "../src/registry.js"

const config: CodingAgentConfig = {
  environment: "test",
  tenant: "fixture-tenant",
  partition: "fixture-partition",
  storage: {
    bucket: "fixture-bucket",
    region: "us-east-1",
    credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" },
  },
  rivet: { namespace: "fixture", poolName: "fixture", startEngine: false },
}

const runtimeLayer = (client: Client, active: boolean) => {
  const reconstructed = layerDurability({
    environment: config.environment,
    tenant: config.tenant,
    partition: config.partition,
    addresses: addressBindings,
    schedulerMode: "external",
  }).pipe(Layer.provide(resolverLayer), Layer.provide(layerSimulator(client)), Layer.provide(BunCrypto.layer))
  return active ? Layer.effectDiscard(activate).pipe(Layer.provideMerge(reconstructed)) : reconstructed
}

const drain = Effect.gen(function* () {
  const scheduler = yield* LocalScheduler.LocalScheduler
  for (let pass = 0; pass < 16; pass++) {
    const result = yield* scheduler.drain({ fuel: 32 })
    if (!result.hasMore) return
  }
  return yield* Effect.die("The fixture Runtime did not become idle")
})

it("registers the Runtime actor under setup and rejects unauthorized actor keys", () => {
  const actor = makeCodingAgentActor(config)
  const registry = make(config)
  expect(registry.config.use.codingAgent).toBeDefined()
  expect(actor.config.actions?.runtime.send).toBeTypeOf("function")
  expect(actor.config.actions?.runtime.inspect).toBeTypeOf("function")
  expect(actor.config.actions?.runtime.drain).toBeTypeOf("function")
  expect(namespaceFromActorKey(config)({ actorId: "actor", key: key(config) })).toEqual({
    environment: config.environment,
    tenant: config.tenant,
    partition: config.partition,
  })
  expect(() => namespaceFromActorKey(config)({ actorId: "actor", key: ["another-tenant", config.partition] })).toThrow(
    "outside this host's authorized Runtime namespace",
  )
})

it.effect("recovers a registered parent, bounded child Sessions, and family messages after reopening", () =>
  Effect.gen(function* () {
    const simulator = yield* makeSimulator()
    const command = makeCommand(config)
    const admitted = yield* Effect.scoped(
      Layer.build(runtimeLayer(simulator, false)).pipe(
        Effect.flatMap((context) =>
          Runtime.Runtime.use((runtime) => runtime.send(command)).pipe(Effect.provide(context)),
        ),
      ),
    )

    const reopenedClient = yield* simulator.connect
    const evidence = yield* Effect.scoped(
      Layer.build(runtimeLayer(reopenedClient, true)).pipe(
        Effect.flatMap((context) =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            let waiting = yield* runtime.inspect(admitted.runId)
            for (let pass = 0; pass < 4 && waiting.children.length === 0; pass++) {
              yield* scheduler.drain({ fuel: 1 })
              waiting = yield* runtime.inspect(admitted.runId)
            }
            expect(waiting.status).toBe("waiting")
            expect(waiting.children).toHaveLength(2)
            const messaged = new Set<string>()
            for (let pass = 0; pass < 4 && messaged.size < 2; pass++) {
              yield* scheduler.drain({ fuel: 1 })
              const progress = yield* runtime.inspect(admitted.runId)
              for (const child of progress.children) {
                if (child.status !== "succeeded" || messaged.has(child.childRunId)) continue
                const result = child.outcome?._tag === "Succeeded" ? child.outcome.result : undefined
                if (result === undefined || !("output" in result) || !Schema.is(Schema.String)(result.output)) {
                  return yield* Effect.die("A completed specialist did not return text")
                }
                const childHistory = yield* runtime.history({ runId: child.childRunId, limit: 200 })
                expect(
                  childHistory.find(
                    (event) => event._tag === "ToolExecutionCompleted" && event.call.name === "send_specialist_note",
                  ),
                ).toMatchObject({ result: { isFailure: false } })
                yield* sendSpecialistNote({
                  fromRunId: child.childRunId,
                  parentRunId: admitted.runId,
                  idempotencyKey: result.output.startsWith("Review:")
                    ? "specialist-note:reviewer"
                    : "specialist-note:test-writer",
                  message: result.output,
                })
                messaged.add(child.childRunId)
              }
            }
            expect(messaged.size).toBe(2)
            yield* drain
            const inspection = yield* runtime.inspect(admitted.runId)
            const history = yield* runtime.history({ runId: admitted.runId, limit: 200 })
            return { inspection, history }
          }).pipe(Effect.provide(context)),
        ),
      ),
    )

    expect(evidence.inspection).toMatchObject({ status: "succeeded", depth: 0, treePolicy })
    expect(evidence.inspection.children).toHaveLength(2)
    expect(evidence.inspection.children.map((child) => child.status)).toEqual(["succeeded", "succeeded"])
    const linked = evidence.history.filter((event) => event._tag === "ChildLinked")
    expect(new Set(linked.map((event) => event.selection))).toEqual(new Set(["reviewer", "test-writer"]))
    expect(evidence.history.find((event) => event._tag === "FanOutAdmitted")).toMatchObject({
      memberCount: 2,
      concurrency: 2,
    })
    expect(evidence.history.find((event) => event._tag === "FanOutJoined")).toMatchObject({
      status: "succeeded",
      succeeded: 2,
    })
    const addressed = evidence.history.flatMap((event) =>
      event._tag === "Inbox" && event.addressed !== undefined ? [event] : [],
    )
    expect(addressed).toHaveLength(2)
    expect(new Set(addressed.map((event) => event.addressed?.from))).toEqual(
      new Set(evidence.inspection.children.map((child) => AgentDirectory.runAddress(child.childRunId))),
    )
    expect(evidence.history.some((event) => event._tag === "SteeringConsumed")).toBe(true)
    expect(evidence.inspection.retainedSession).toMatchObject({
      id: command.sessionId,
      rootSessionId: command.sessionId,
      parentRunId: null,
    })
    expect(evidence.inspection.children.map((child) => child.retainedSession)).toEqual([
      expect.objectContaining({ rootSessionId: command.sessionId, parentRunId: admitted.runId, depth: 1 }),
      expect.objectContaining({ rootSessionId: command.sessionId, parentRunId: admitted.runId, depth: 1 }),
    ])
    const completed = evidence.history.find((event) => event._tag === "RunCompleted")
    expect(
      completed?._tag === "RunCompleted" && "output" in completed.result ? completed.result.output : undefined,
    ).toBe("Fixed average([]) to return 0; all three fixture cases pass.")
    const tests = evidence.history.find(
      (event) => event._tag === "ToolExecutionCompleted" && event.call.name === "run_tests",
    )
    expect(tests?._tag === "ToolExecutionCompleted" ? tests.result.encodedResult : undefined).toMatchObject({
      passed: 3,
      failed: 0,
    })

    const finalClient = yield* simulator.connect
    const replay = yield* Effect.scoped(
      Layer.build(runtimeLayer(finalClient, false)).pipe(
        Effect.flatMap((context) =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const receipt = yield* runtime.send(command)
            const inspection = yield* runtime.inspect(receipt.runId)
            return { receipt, inspection }
          }).pipe(Effect.provide(context)),
        ),
      ),
    )
    expect(replay.receipt.runId).toBe(admitted.runId)
    expect(replay.inspection.status).toBe("succeeded")
    expect(replay.inspection.children).toHaveLength(2)
  }),
)
