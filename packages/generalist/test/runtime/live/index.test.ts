import { expect, it } from "@effect/vitest"
import { BunCrypto } from "@effect/platform-bun"
import { Context, Effect, Exit, Fiber, Layer, Ref, Schedule, Schema, Scope, Stream } from "effect"
import { Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentTool, Approvals, Permissions } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import type { Event } from "generalist/live"
import { Errors, Runtime } from "generalist/runtime"
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

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const waitForRequests = (harness: TestProvider.Harness, count: number) =>
  harness.requests.pipe(
    Effect.filterOrFail((requests) => requests.length >= count),
    Effect.retry(Schedule.spaced("5 millis")),
    Effect.timeout("20 seconds"),
  )

it.live("commits only the completed response with the exact prompt, toolkit, and assignment", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const observed = yield* Ref.make<ReadonlyArray<Event>>([])
    const model = RuntimeLive.layer({
      capabilities,
      onEvent: (event) => Ref.update(observed, (events) => [...events, event]),
    }).pipe(Layer.provide(harness.layer))
    const context = yield* Layer.build(model)
    const agent = Agent.make({ name: "live-final-authority" })
    const run = yield* Effect.forkChild(Agent.run(agent, "hello live").pipe(Effect.provideContext(context)))

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
  }).pipe(Effect.scoped),
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
    const context = yield* Layer.build(
      Layer.mergeAll(model, handlers, Permissions.layerAllowAll, Approvals.layerAutoApprove),
    )
    const run = yield* Effect.forkChild(Agent.run(agent, "use echo").pipe(Effect.provideContext(context)))

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
  }).pipe(Effect.scoped),
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
    const changed = yield* runtime.start(agent, "changed input", { idempotencyKey: "live-command" }).pipe(Effect.flip)
    expect(changed).toBeInstanceOf(Errors.IdempotencyConflict)

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
    expect(encodeJson(failure)).not.toContain("secret provider detail")
    yield* Effect.sleep("50 millis")
    expect(yield* harness.requests).toHaveLength(1)
  }).pipe(Effect.scoped),
)

it.live("maps accepted input to canonical Session entries and idempotent commands", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const agent = Agent.make({ name: "live-session-agent" })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    const storage = makeObjectStorage()
    const context = yield* Layer.build(
      Runtime.layer({
        agents: { "live-session-agent": agent },
        revision: "live-session-v1",
        services: Layer.empty,
        executionServices: () => model,
        storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
        namespace: { environment: "test", tenant: "live", partition: "session-commands" },
        scheduler: { pollInterval: "5 millis" },
      }),
    )
    const runtime = Context.get(context, Runtime.Runtime)
    const session = yield* runtime.sessions.create({ sessionId: "live-session" })
    yield* session.control("stop", "pause-live-session")

    const receipt = yield* session.submit(agent, "queued live input", { commandId: "submit-live" })
    expect(yield* session.submit(agent, "queued live input", { commandId: "submit-live" })).toEqual(receipt)
    const conflict = yield* session.submit(agent, "changed input", { commandId: "submit-live" }).pipe(Effect.flip)
    expect(conflict).toMatchObject({ _tag: "generalist/session/IdempotencyConflict", commandId: "submit-live" })

    const events = yield* session.events().pipe(
      Stream.takeUntil((event) => event._tag === "RunChanged" && event.run.status === "succeeded"),
      Stream.runCollect,
      Effect.forkChild,
    )
    yield* session.control("resume", "resume-live-session")

    const request = (yield* waitForRequests(harness, 1))[0]!.request
    expect(request.context.content.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "queued live input" }],
    })
    yield* harness.controls.output(Response.makePart("text-delta", { id: "provisional", delta: "not durable" }))
    yield* harness.controls.complete([Response.makePart("text", { text: "session result" })])

    const observed = yield* Fiber.join(events)
    const entries = observed.flatMap((event) => (event._tag === "ConversationChanged" ? event.update.entries : []))
    const accepted = entries.filter((entry) => encodeJson(entry).includes("queued live input"))
    expect(new Set(accepted.map((entry) => entry.id))).toHaveProperty("size", 1)
    expect(encodeJson(entries)).toContain("session result")
    expect(encodeJson(entries)).not.toContain("not durable")
  }).pipe(Effect.scoped),
)

it.live("delegates child work through existing Runtime authority", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const reviewer = Agent.make({ name: "live-reviewer" })
    const delegate = AgentTool.fanOut({
      name: "delegate_review",
      description: "Delegate review work to a child agent",
      agents: { reviewer: { agent: reviewer } },
      maxChildren: 1,
    })
    const parent = Agent.make({ name: "live-parent", tools: [delegate] })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    const storage = makeObjectStorage()
    const context = yield* Layer.build(
      Runtime.layer({
        agents: { "live-parent": parent },
        revision: "live-parent-v1",
        services: Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove),
        executionServices: () => model,
        storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
        namespace: { environment: "test", tenant: "live", partition: "live-children" },
        scheduler: { pollInterval: "5 millis" },
      }),
    )
    const runtime = Context.get(context, Runtime.Runtime)
    const run = yield* runtime.start(parent, "coordinate a review", { idempotencyKey: "delegate-command" })

    const first = (yield* waitForRequests(harness, 1))[0]!.request
    expect(Object.keys(first.toolkit.tools)).toContain("delegate_review")
    yield* harness.controls.complete([
      Response.makePart("tool-call", {
        id: "delegate-1",
        name: "delegate_review",
        params: { children: [{ agent: "reviewer", input: "Review authorization" }] },
        providerExecuted: false,
      }),
    ])

    const childRequest = (yield* waitForRequests(harness, 2))[1]!.request
    const admitted = yield* runtime.children.list(run.runId)
    expect(admitted).toHaveLength(1)
    expect(childRequest.assignment.turnId).toContain(admitted[0]!.childRunId)
    expect(childRequest.assignment.turnId).not.toBe(first.assignment.turnId)
    expect(childRequest.context.content.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "Review authorization" }],
    })
    yield* harness.controls.complete([Response.makePart("text", { text: "review done" })])

    const continuation = (yield* waitForRequests(harness, 3))[2]!.request
    const toolResult = continuation.context.content
      .flatMap((message) => (message.role === "tool" ? message.content : []))
      .find((part): part is Prompt.ToolResultPart => part.type === "tool-result")
    expect(toolResult).toMatchObject({ id: "delegate-1", name: "delegate_review" })
    expect(encodeJson(toolResult)).toContain("review done")
    yield* harness.controls.complete([Response.makePart("text", { text: "delegation complete" })])

    expect(yield* run.await).toBe("delegation complete")
    expect(yield* runtime.children.list(run.runId)).toMatchObject([{ status: "succeeded" }])
    expect(yield* harness.resourceCount).toBe(0)
  }).pipe(Effect.scoped),
)

it.live("fails a delegated child turn as a durable child outcome, not a second loop", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const reviewer = Agent.make({ name: "live-lost-reviewer" })
    const delegate = AgentTool.fanOut({
      name: "delegate_lost_review",
      description: "Delegate review work to a child agent",
      agents: { reviewer: { agent: reviewer } },
      maxChildren: 1,
    })
    const parent = Agent.make({ name: "live-lost-parent", tools: [delegate] })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    const storage = makeObjectStorage()
    const context = yield* Layer.build(
      Runtime.layer({
        agents: { "live-lost-parent": parent },
        revision: "live-lost-parent-v1",
        services: Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove),
        executionServices: () => model,
        storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
        namespace: { environment: "test", tenant: "live", partition: "live-child-loss" },
        scheduler: { pollInterval: "5 millis" },
      }),
    )
    const runtime = Context.get(context, Runtime.Runtime)
    const run = yield* runtime.start(parent, "coordinate a review", { idempotencyKey: "delegate-loss" })

    yield* waitForRequests(harness, 1)
    yield* harness.controls.complete([
      Response.makePart("tool-call", {
        id: "delegate-lost-1",
        name: "delegate_lost_review",
        params: { children: [{ agent: "reviewer", input: "Review authorization" }] },
        providerExecuted: false,
      }),
    ])

    yield* waitForRequests(harness, 2)
    yield* harness.controls.lose("child link dropped")

    const continuation = (yield* waitForRequests(harness, 3))[2]!.request
    const toolResult = continuation.context.content
      .flatMap((message) => (message.role === "tool" ? message.content : []))
      .find((part): part is Prompt.ToolResultPart => part.type === "tool-result")
    expect(toolResult).toMatchObject({ id: "delegate-lost-1", name: "delegate_lost_review" })
    yield* harness.controls.complete([Response.makePart("text", { text: "child reported failure" })])

    expect(yield* run.await).toBe("child reported failure")
    expect(yield* runtime.children.list(run.runId)).toMatchObject([{ status: "failed" }])
  }).pipe(Effect.scoped),
)

it.live("rejects provider events carrying a stale assignment", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const agent = Agent.make({ name: "live-stale" })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    const storage = makeObjectStorage()
    const context = yield* Layer.build(
      Runtime.layer({
        agents: { "live-stale": agent },
        revision: "live-stale-v1",
        services: Layer.empty,
        executionServices: () => model,
        storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
        namespace: { environment: "test", tenant: "live", partition: "stale-assignment" },
        scheduler: { pollInterval: "5 millis" },
      }),
    )
    const runtime = Context.get(context, Runtime.Runtime)
    const run = yield* runtime.start(agent, "stale turn", { idempotencyKey: "stale-command" })
    yield* waitForRequests(harness, 1)

    yield* harness.controls.emit({
      _tag: "Output",
      assignment: { turnId: "superseded-turn", assignmentId: "superseded-assignment" },
      provisional: true,
      part: Response.makePart("text", { text: "stale" }),
    })

    const failure = yield* run.await.pipe(Effect.flip)
    expect(failure._tag).toBe("RunFailed")
    if (failure._tag !== "RunFailed") return
    expect(failure.error.message).toContain("Live turn outcome is unknown")
    yield* Effect.sleep("50 millis")
    expect(yield* harness.requests).toHaveLength(1)
    expect(yield* harness.resourceCount).toBe(0)
  }).pipe(Effect.scoped),
)

it.live("distinguishes interruption, cancellation, and incarnation retirement", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const agent = Agent.make({ name: "live-transitions" })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    const storage = makeObjectStorage()
    const scope = yield* Scope.make()
    const context = yield* Layer.build(
      Runtime.layer({
        agents: { "live-transitions": agent },
        revision: "live-transitions-v1",
        services: Layer.empty,
        executionServices: () => model,
        storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
        namespace: { environment: "test", tenant: "live", partition: "transitions" },
        scheduler: { pollInterval: "5 millis" },
      }),
    ).pipe(Scope.provide(scope))
    const runtime = Context.get(context, Runtime.Runtime)

    const interrupted = yield* runtime.start(agent, "interrupt me", { idempotencyKey: "interrupt-command" })
    yield* waitForRequests(harness, 1)
    yield* harness.controls.interrupt
    const interruptFailure = yield* interrupted.await.pipe(Effect.flip)
    expect(interruptFailure._tag).toBe("RunFailed")
    if (interruptFailure._tag === "RunFailed") {
      expect(interruptFailure.error.message).toContain("Live turn outcome is unknown")
    }
    expect((yield* runtime.inspect(interrupted.runId)).status).toBe("failed")
    yield* Effect.sleep("50 millis")
    expect(yield* harness.requests).toHaveLength(1)

    const cancelled = yield* runtime.start(agent, "cancel me", { idempotencyKey: "cancel-command" })
    yield* waitForRequests(harness, 2)
    yield* runtime.cancel({ runId: cancelled.runId, commandId: "cancel-live", reason: "operator stopped" })
    const cancelFailure = yield* cancelled.await.pipe(Effect.flip)
    expect(cancelFailure).toMatchObject({ _tag: "RunCancelled", reason: "operator stopped" })
    expect((yield* runtime.inspect(cancelled.runId)).status).toBe("cancelled")
    expect(yield* harness.resourceCount).toBe(0)

    yield* Scope.close(scope, Exit.void)
    const retired = yield* runtime.start(agent, "after close").pipe(Effect.flip)
    expect(retired).toMatchObject({ _tag: "generalist/runtime/RuntimeRetired" })
  }),
)

it.live("reconnects a fresh connection-generation after provider loss", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const echo = Tool.make("echo", {
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(echo)
    const agent = Agent.make({ name: "live-reconnect", toolkit })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    let toolCalls = 0
    const handlers = toolkit.toLayer({
      echo: ({ text }) =>
        Effect.sync(() => {
          toolCalls += 1
          return `echo:${text}`
        }),
    })
    const storage = makeObjectStorage()
    const context = yield* Layer.build(
      Runtime.layer({
        agents: { "live-reconnect": agent },
        revision: "live-reconnect-v1",
        services: Layer.empty,
        executionServices: () => Layer.mergeAll(model, handlers, Permissions.layerAllowAll, Approvals.layerAutoApprove),
        storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
        namespace: { environment: "test", tenant: "live", partition: "reconnect" },
        scheduler: { pollInterval: "5 millis" },
      }),
    )
    const runtime = Context.get(context, Runtime.Runtime)

    const lost = yield* runtime.start(agent, "lost attempt", { idempotencyKey: "disconnect-1" })
    yield* waitForRequests(harness, 1)
    yield* harness.controls.output(Response.makePart("text-delta", { id: "p", delta: "provisional only" }))
    yield* harness.controls.lose("link dropped")
    expect((yield* lost.await.pipe(Effect.flip))._tag).toBe("RunFailed")

    const pending = yield* runtime.start(agent, "pending tool", { idempotencyKey: "disconnect-2" })
    yield* waitForRequests(harness, 2)
    yield* harness.controls.complete([
      Response.makePart("tool-call", {
        id: "echo-pending",
        name: "echo",
        params: { text: "retained" },
        providerExecuted: false,
      }),
    ])
    const continuation = (yield* waitForRequests(harness, 3))[2]!.request
    const toolResult = continuation.context.content
      .flatMap((message) => (message.role === "tool" ? message.content : []))
      .find((part): part is Prompt.ToolResultPart => part.type === "tool-result")
    expect(toolResult).toMatchObject({ id: "echo-pending", name: "echo", result: "echo:retained" })
    yield* harness.controls.lose("dropped mid-tool-turn")
    expect((yield* pending.await.pipe(Effect.flip))._tag).toBe("RunFailed")
    const history = yield* runtime.history({ runId: pending.runId, limit: 100 })
    expect(history.some((event) => event._tag === "ToolExecutionCompleted")).toBe(true)
    expect(toolCalls).toBe(1)

    const recovered = yield* runtime.start(agent, "final attempt", { idempotencyKey: "disconnect-3" })
    const request = (yield* waitForRequests(harness, 4))[3]!.request
    expect(request.context.content.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "final attempt" }],
    })
    yield* harness.controls.complete([Response.makePart("text", { text: "after reconnect" })])
    expect(yield* recovered.await).toBe("after reconnect")
    expect(yield* harness.resourceCount).toBe(0)
  }).pipe(Effect.scoped),
)

it.live("parks an ambiguous in-flight turn on replacement until an operator resolves it", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const agent = Agent.make({ name: "live-replaced" })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    const storage = makeObjectStorage()
    const options = {
      agents: { "live-replaced": agent },
      revision: "live-replaced-v1",
      services: Layer.empty,
      executionServices: () => model,
      storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
      namespace: { environment: "test", tenant: "live", partition: "replacement" },
      scheduler: { pollInterval: "5 millis" },
    } as const

    const scopeA = yield* Scope.make()
    const contextA = yield* Layer.build(Runtime.layer(options)).pipe(Scope.provide(scopeA))
    const runtimeA = Context.get(contextA, Runtime.Runtime)
    const run = yield* runtimeA.start(agent, "survive replacement", { idempotencyKey: "replace-me" })
    const first = (yield* waitForRequests(harness, 1))[0]!.request
    expect(first.assignment.turnId).toContain(run.runId)
    yield* Scope.close(scopeA, Exit.void)

    const contextB = yield* Layer.build(Runtime.layer(options))
    const runtimeB = Context.get(contextB, Runtime.Runtime)

    // The ambiguous provider outcome parks the run; the replacement incarnation
    // never silently retries the in-flight live turn.
    const explanation = yield* Effect.retry(
      Effect.filterOrFail(runtimeB.operator.explain(run.runId), (value) => value.status === "needs-resolution"),
      Schedule.spaced("5 millis"),
    )
    expect(explanation.decision._tag).toBe("Unknown")
    yield* Effect.sleep("50 millis")
    expect(yield* harness.requests).toHaveLength(1)
    const retired = yield* runtimeA.start(agent, "stale incarnation").pipe(Effect.flip)
    expect(retired).toMatchObject({ _tag: "generalist/runtime/RuntimeRetired" })

    // The operator asserts the ambiguous outcome explicitly; the run then fails
    // with that observable outcome rather than a sanitized provider error.
    const obligation = explanation.obligations.find((decision) => decision._tag === "Unknown")
    expect(obligation).toBeDefined()
    yield* runtimeB.operator.resolveUnknown(
      run.runId,
      obligation!.operationId,
      { outcome: "failed", error: "provider connection lost during replacement" },
      "operator:test",
      "replace-resolve",
    )
    yield* Effect.retry(
      Effect.filterOrFail(runtimeB.inspect(run.runId), (inspection) => inspection.status === "failed"),
      Schedule.spaced("5 millis"),
    )
    expect(yield* harness.requests).toHaveLength(1)
    expect(yield* harness.resourceCount).toBe(0)
  }).pipe(Effect.scoped),
)

it.live("projects semantic live Session state without provider internals", () =>
  Effect.gen(function* () {
    const harness = yield* TestProvider.make(capabilities)
    const agent = Agent.make({ name: "live-projected" })
    const model = RuntimeLive.layer({ capabilities }).pipe(Layer.provide(harness.layer))
    const storage = makeObjectStorage()
    const context = yield* Layer.build(
      Runtime.layer({
        agents: { "live-projected": agent },
        revision: "live-projected-v1",
        services: Layer.empty,
        executionServices: () => model,
        storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
        namespace: { environment: "test", tenant: "live", partition: "projection" },
        scheduler: { pollInterval: "5 millis" },
      }),
    )
    const runtime = Context.get(context, Runtime.Runtime)
    const session = yield* runtime.sessions.create({ sessionId: "live-projection-session" })
    const events = yield* session.events().pipe(
      Stream.takeUntil((event) => event._tag === "RunChanged" && event.run.status === "succeeded"),
      Stream.runCollect,
      Effect.forkChild,
    )
    const run = yield* runtime.start(agent, "project me", {
      idempotencyKey: "project-1",
      sessionId: "live-projection-session",
    })
    yield* waitForRequests(harness, 1)
    yield* harness.controls.output(
      Response.makePart("file", { data: new Uint8Array([9, 9, 9]), mediaType: "audio/pcm" }),
    )
    yield* harness.controls.complete([Response.makePart("text", { text: "projected result" })])

    expect(yield* run.await).toBe("projected result")
    const collected = yield* Fiber.join(events)
    const projected = encodeJson(collected)
    expect(projected).toContain("project me")
    expect(projected).toContain("projected result")
    expect(projected).not.toContain("test-live-")
    expect(projected).not.toContain("audio/pcm")
    expect(projected).not.toContain("superseded")
  }).pipe(Effect.scoped),
)
