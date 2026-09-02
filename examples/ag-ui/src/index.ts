/* oxlint-disable effecttsgo/async-function -- The example intentionally demonstrates a client built with the Promise-only fetch API. */
import { layer as bunHttpServer } from "@effect/platform-bun/BunHttpServer"
import { EventSchemas, EventType, RunAgentInputSchema, type AGUIEvent, type RunAgentInput } from "@ag-ui/core"
import { Console, Effect, Layer, ManagedRuntime, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http"
import { Agent, AgentManifest, Approvals, Permissions, Pins } from "generalist"
import { Generalist } from "generalist/host"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"
import { AGUI } from "generalist/unstable/ag-ui"

const publish = Tool.make("publish_release", {
  description: "Publish the approved release",
  parameters: Schema.Struct({ version: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})
const toolkit = Toolkit.make(publish)
const agent = Agent.make({ name: "ag-ui-example", toolkit })
const address = Address.make("agent:ag-ui-example")

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})
const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })

let modelCalls = 0
const scriptedModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      modelCalls += 1
      return modelCalls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "publish-1",
              name: publish.name,
              params: { version: "1.0.0" },
              providerExecuted: false,
            }),
            finish("tool-calls"),
          )
        : Stream.make(
            Response.makePart("text-delta", { id: "approved", delta: "Release 1.0.0 was approved and published." }),
            finish("stop"),
          )
    },
  }),
)

let publishCalls = 0
const handlers = toolkit.toLayer({
  publish_release: ({ version }) =>
    Effect.sync(() => {
      publishCalls += 1
      return `published ${version}`
    }),
})
const pendingApprovals = Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) })
const authorization = Layer.mergeAll(Permissions.layerAllowAll, pendingApprovals)

const pinnedAgent = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ example: "ag-ui", revision: "1" }),
  tools: [{ name: publish.name, pin: Pins.makeCapability({ example: "ag-ui", tool: publish.name, revision: "1" }) }],
  skills: [],
  services: [],
  policy:
    agent.policy.snapshot === undefined
      ? { _tag: "Pinned", pin: Pins.makeCapability({ example: "ag-ui", policy: "1" }) }
      : { _tag: "Portable", policy: agent.policy.snapshot },
  budget: agent.budget ?? {},
  children: [],
})
const executable = ExecutableManifest.make({
  root: pinnedAgent.pin,
  entries: [{ _tag: "Agent", ...pinnedAgent }],
})
const registrations = [...ExecutableRegistration.requiredPins(executable)].map((pin) => ({
  pin,
  codec: "ag-ui-example",
  version: "1",
  payload: { agent: agent.name },
}))
const resolver = ExecutableResolver.layerStatic([
  {
    executable,
    agent: Agent.close(agent, Layer.mergeAll(scriptedModel, handlers, authorization)),
  },
]).pipe(Layer.orDie)
const runtimeLayer = Runtime.layerMemory({
  addresses: [{ address, executable, registrations }],
}).pipe(Layer.provide(resolver))
const agentServices = Layer.mergeAll(runtimeLayer, scriptedModel, handlers, authorization)

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const aguiRoute = HttpRouter.add("POST", "/ag-ui", (request) =>
  Effect.gen(function* () {
    const parsed = RunAgentInputSchema.safeParse(yield* request.json)
    if (!parsed.success) {
      return yield* HttpServerResponse.json({ error: parsed.error.message }, { status: 400 })
    }
    const agui = yield* AGUI.AGUI
    const body = agui.run(parsed.data).pipe(
      Stream.map((event) => `data: ${encodeJson(event)}\n\n`),
      Stream.encodeText,
      Stream.orDie,
    )
    return HttpServerResponse.stream(body, {
      contentType: "text/event-stream",
      headers: { "cache-control": "no-cache" },
    })
  }),
)
const aguiLayer = AGUI.layer({ address }).pipe(Layer.provide(runtimeLayer))
const aguiRoutes = aguiRoute.pipe(Layer.provide(aguiLayer))
const demoAuth = Layer.succeed(Server.Authentication, Server.Authentication.of({ bearer: (httpEffect) => httpEffect }))
const routes = Layer.unwrap(
  Generalist.create({ agents: [agent] }).pipe(
    Effect.map((host) => Layer.merge(Server.layer({ host, auth: demoAuth }), aguiRoutes)),
    Effect.orDie,
  ),
).pipe(Layer.provide(agentServices))
const serverLayer = HttpRouter.serve(routes, { disableLogger: true }).pipe(
  Layer.provideMerge(bunHttpServer({ port: 0 })),
  Layer.provide(aguiLayer),
)

const runInput: RunAgentInput = {
  threadId: "session:ag-ui-example",
  runId: "run:ag-ui-example",
  state: {},
  messages: [{ id: "message:publish", role: "user", content: "Publish release 1.0.0." }],
  tools: [],
  context: [],
  forwardedProps: {},
}

const fetchAguiEvents = async (baseUrl: string) => {
  try {
    // oxlint-disable-next-line effecttsgo/global-fetch -- This example intentionally demonstrates a plain-fetch client.
    const response = await fetch(`${baseUrl}/ag-ui`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: encodeJson(runInput),
    })
    if (!response.ok || response.body === null) {
      return { _tag: "Failure" as const, message: `AG-UI request failed with ${response.status}` }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const events: Array<AGUIEvent> = []
    let buffered = ""
    while (true) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each SSE chunk must be consumed before reading the next one.
      const next = await reader.read()
      if (next.done) break
      buffered += decoder.decode(next.value, { stream: true })
      let boundary = buffered.indexOf("\n\n")
      while (boundary !== -1) {
        const frame = buffered.slice(0, boundary)
        buffered = buffered.slice(boundary + 2)
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => line.slice(6))
          .join("\n")
        if (data !== "") {
          const value = Schema.decodeOption(Schema.fromJsonString(Schema.Unknown))(data)
          if (Option.isNone(value))
            return { _tag: "Failure" as const, message: "The AG-UI stream returned invalid JSON" }
          const event = EventSchemas.safeParse(value.value)
          if (!event.success) return { _tag: "Failure" as const, message: event.error.message }
          events.push(event.data)
        }
        boundary = buffered.indexOf("\n\n")
      }
    }
    return { _tag: "Success" as const, events }
  } catch (cause) {
    return { _tag: "Failure" as const, message: `Could not stream AG-UI events: ${String(cause)}` }
  }
}

const readAguiEvents = Effect.fn("readAguiEvents")(function* (baseUrl: string) {
  const result = yield* Effect.promise(() => fetchAguiEvents(baseUrl))
  if (result._tag === "Failure") return yield* Effect.die(result.message)
  return result.events
})

const approvalMetadata = Schema.Struct({
  approval: Schema.Struct({ approvalId: Schema.String }),
})
const inspection = Schema.Struct({ status: Schema.String })
const decodeInspection = Schema.decodeUnknownEffect(Schema.fromJsonString(inspection))

const awaitSucceeded = (baseUrl: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = yield* Effect.tryPromise(() =>
        // oxlint-disable-next-line effecttsgo/global-fetch-in-effect -- This example intentionally demonstrates a plain-fetch client.
        fetch(`${baseUrl}/runs/${encodeURIComponent(runInput.runId)}`),
      ).pipe(Effect.orDie)
      const current = yield* Effect.tryPromise(() => response.text()).pipe(
        Effect.flatMap(decodeInspection),
        Effect.orDie,
      )
      if (current.status === "succeeded") return current.status
      yield* Effect.sleep("10 millis")
    }
    return yield* Effect.die("The approved AG-UI run did not complete")
  })

const program = Effect.gen(function* () {
  const server = yield* HttpServer.HttpServer
  if (server.address._tag !== "TcpAddress") return yield* Effect.die("The AG-UI example requires a TCP server")
  const baseUrl = `http://127.0.0.1:${server.address.port}`
  const events = yield* readAguiEvents(baseUrl)
  const interrupted = events.find(
    (event) => event.type === EventType.RUN_FINISHED && event.outcome?.type === "interrupt",
  )
  if (interrupted?.type !== EventType.RUN_FINISHED || interrupted.outcome?.type !== "interrupt") {
    return yield* Effect.die("The AG-UI stream did not produce an approval interrupt")
  }
  const token = yield* Schema.decodeUnknownEffect(approvalMetadata)(interrupted.outcome.interrupts[0]?.metadata).pipe(
    Effect.map((metadata) => metadata.approval.approvalId),
    Effect.orDie,
  )
  const approval = yield* Effect.tryPromise(() =>
    // oxlint-disable-next-line effecttsgo/global-fetch-in-effect -- This example intentionally demonstrates a plain-fetch client.
    fetch(`${baseUrl}/runs/${encodeURIComponent(runInput.runId)}/approvals/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: encodeJson({ decision: { _tag: "Approved" }, operator: "operator:ag-ui-example" }),
    }),
  ).pipe(Effect.orDie)
  if (!approval.ok) return yield* Effect.die(`Approval request failed with ${approval.status}`)
  const status = yield* awaitSucceeded(baseUrl)
  if (publishCalls !== 1) return yield* Effect.die("The approved tool did not run exactly once")

  yield* Console.log(`AG-UI events: ${events.map((event) => event.type).join(" -> ")}`)
  yield* Console.log(`Approval route: POST /runs/${runInput.runId}/approvals/:token -> ${approval.status}`)
  yield* Console.log(`Run status: ${status}; publish calls: ${publishCalls}`)
})

const runtime = ManagedRuntime.make(serverLayer)
try {
  await runtime.runPromise(program)
} finally {
  await runtime.dispose()
}
