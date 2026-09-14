import { expect, it } from "@effect/vitest"
import { BunCrypto } from "@effect/platform-bun"
import { Context, Effect, Fiber, Layer, Ref, Schedule, Schema } from "effect"
import { Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import type { Event } from "generalist/live"
import { Runtime } from "generalist/runtime"
import * as RuntimeLive from "generalist/runtime/live"
import { TestProvider } from "generalist/testing/live"
import { makeObjectStorage } from "../execution/object.js"

const capabilities = {
  input: [
    { modality: "text", mediaTypes: [] },
    { modality: "audio", mediaTypes: ["audio/pcm"] },
  ],
  output: [
    { modality: "text", mediaTypes: [] },
    { modality: "audio", mediaTypes: ["audio/pcm"] },
  ],
  tools: true,
  interruption: true,
} as const

const waitForRequests = (harness: TestProvider.Harness, count: number) =>
  harness.requests.pipe(
    Effect.filterOrFail((requests) => requests.length >= count),
    Effect.retry(Schedule.spaced("5 millis")),
  )

it.live("commits only the completed response with the exact prompt, toolkit, and assignment", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const observed = yield* Ref.make<ReadonlyArray<Event>>([])
    const model = RuntimeLive.layer({
      capabilities,
      onEvent: (event) => Ref.update(observed, (events) => [...events, event]),
    }).pipe(Layer.provide(harness.layer))
    const agent = Agent.make({ name: "live-final-authority" })
    const run = yield* Effect.forkChild(Agent.run(agent, "hello live").pipe(Effect.provide(model)))

    const requests = yield* waitForRequests(harness, 1)
    const request = requests[0]!.request
    expect(request.assignment.turnId).toBe(request.assignment.assignmentId)
    expect(request.context.content.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "hello live" }],
    })
    expect(Object.keys(request.toolkit.tools)).toEqual([])

    yield* harness.controls.output(
      Response.makePart("file", {
        data: new Uint8Array([1, 2, 3]),
        mediaType: "audio/pcm",
      }),
    )
    yield* harness.controls.output(Response.makePart("text-delta", { id: "provisional", delta: "discard me" }))
    yield* harness.controls.complete([Response.makePart("text", { text: "committed" })])

    expect(yield* Fiber.join(run)).toBe("committed")
    const events = yield* Ref.get(observed)
    expect(events.some((event) => event._tag === "Output" && event.part.type === "file")).toBe(true)
    expect(events.some((event) => event._tag === "Output" && event.part.type === "text-delta")).toBe(true)
    expect(yield* harness.resourceCount).toBe(0)
  }),
)

it.live("returns Live tool calls to the existing Agent tool loop", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const echo = Tool.make("echo", {
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(echo)
    const agent = Agent.make({ name: "live-tools", toolkit })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    const handlers = toolkit.toLayer({ echo: ({ text }) => Effect.succeed(`echo:${text}`) })
    const run = yield* Effect.forkChild(
      Agent.run(agent, "use echo").pipe(
        Effect.provide(Layer.mergeAll(model, handlers, Permissions.layerAllowAll, Approvals.layerAutoApprove)),
      ),
    )

    const first = (yield* waitForRequests(harness, 1))[0]!.request
    expect(Object.keys(first.toolkit.tools)).toEqual(["echo"])
    yield* harness.controls.complete([
      Response.makePart("tool-call", {
        id: "echo-1",
        name: "echo",
        params: { text: "hello" },
        providerExecuted: false,
      }),
    ])

    const requests = yield* waitForRequests(harness, 2)
    const second = requests[1]!.request
    const toolResult = second.context.content
      .flatMap((message) => (message.role === "tool" ? message.content : []))
      .find((part): part is Prompt.ToolResultPart => part.type === "tool-result")
    expect(toolResult).toMatchObject({ id: "echo-1", name: "echo", result: "echo:hello" })
    expect(second.assignment.turnId).not.toBe(first.assignment.turnId)
    yield* harness.controls.complete([Response.makePart("text", { text: "done" })])

    expect(yield* Fiber.join(run)).toBe("done")
    expect(yield* harness.resourceCount).toBe(0)
  }),
)

it.live("uses canonical Runtime admission and durable model-operation identity", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const agent = Agent.make({ name: "runtime-live" })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    const storage = makeObjectStorage()
    const context = yield* Layer.build(
      Runtime.layer({
        agents: { "runtime-live": agent },
        revision: "runtime-live-v1",
        services: Layer.empty,
        executionServices: () => model,
        storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
        namespace: { environment: "test", tenant: "live", partition: "runtime" },
        scheduler: { pollInterval: "5 millis" },
      }),
    )
    const runtime = Context.get(context, Runtime.Runtime)
    const first = yield* runtime.start(agent, "durable hello", { idempotencyKey: "live-command" })
    const duplicate = yield* runtime.start(agent, "durable hello", { idempotencyKey: "live-command" })
    expect(duplicate.runId).toBe(first.runId)

    const request = (yield* waitForRequests(harness, 1))[0]!.request
    expect(request.assignment.turnId).toContain(first.runId)
    yield* harness.controls.complete([Response.makePart("text", { text: "durable result" })])

    expect(yield* first.await).toBe("durable result")
    expect(yield* harness.requests).toHaveLength(1)
  }).pipe(Effect.scoped),
)

it.live("does not retry a durable turn whose Live outcome is unknown", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const agent = Agent.make({ name: "runtime-live-loss" })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    const storage = makeObjectStorage()
    const context = yield* Layer.build(
      Runtime.layer({
        agents: { "runtime-live-loss": agent },
        revision: "runtime-live-loss-v1",
        services: Layer.empty,
        executionServices: () => model,
        storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
        namespace: { environment: "test", tenant: "live", partition: "loss" },
        scheduler: { pollInterval: "5 millis" },
      }),
    )
    const runtime = Context.get(context, Runtime.Runtime)
    const run = yield* runtime.start(agent, "uncertain turn", { idempotencyKey: "lost-live-command" })
    yield* waitForRequests(harness, 1)
    yield* harness.controls.lose("secret provider detail")

    const failure = yield* run.await.pipe(Effect.flip)
    expect(failure._tag).toBe("RunFailed")
    if (failure._tag !== "RunFailed") return
    expect(failure.error.message).toContain("Live turn outcome is unknown")
    expect(JSON.stringify(failure)).not.toContain("secret provider detail")
    yield* Effect.sleep("50 millis")
    expect(yield* harness.requests).toHaveLength(1)
  }).pipe(Effect.scoped),
)
