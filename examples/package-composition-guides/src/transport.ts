import { BunCrypto } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, ManagedRuntime, Option, Stream } from "effect"
import { Agent, AgentManifest, Approvals, Permissions, Pins } from "generalist"
import * as Durability from "generalist/durability"
import * as S3 from "generalist/durability/s3"
import { Generalist } from "generalist/host"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"

const agent = Agent.make({ name: "transport-agent" })
const address = Address.make("agent:transport-agent")
const pinnedAgent = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ example: "package-composition-guides", agent: agent.name, revision: "1" }),
  tools: [],
  skills: [],
  services: [],
  policy:
    agent.policy.snapshot === undefined
      ? { _tag: "Pinned", pin: Pins.makeCapability({ example: "package-composition-guides", policy: "1" }) }
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
  codec: "package-composition-transport",
  version: "1",
  payload: { agent: agent.name },
}))
const agentServices = Layer.mergeAll(
  TestModel.layer([TestModel.text("Hello from transport.")]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)
const resolver = ExecutableResolver.layerStatic([
  { executable, agent: Agent.close(agent, agentServices) },
]).pipe(Layer.orDie)

const runtimeLayer = Layer.unwrap(
  Effect.gen(function* () {
    const environment = yield* Config.string("GENERALIST_ENVIRONMENT")
    const tenant = yield* Config.string("GENERALIST_TENANT")
    const partition = yield* Config.string("GENERALIST_PARTITION")
    const bucket = yield* Config.string("GENERALIST_BUCKET")
    const region = yield* Config.string("AWS_REGION")
    const accessKeyId = yield* Config.string("AWS_ACCESS_KEY_ID")
    const secretAccessKey = yield* Config.string("AWS_SECRET_ACCESS_KEY")
    const sessionToken = Option.getOrUndefined(yield* Config.option(Config.string("AWS_SESSION_TOKEN")))
    const endpoint = Option.getOrUndefined(yield* Config.option(Config.string("GENERALIST_S3_ENDPOINT")))
    const confirmed = endpoint === undefined ? false : yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED")
    const reconstructed = Durability.layer({
      environment,
      tenant,
      partition,
      addresses: [{ address, executable, registrations }],
    }).pipe(
      Layer.provide(resolver),
      Layer.provide(
        S3.layer({
          bucket,
          region,
          credentials: { accessKeyId, secretAccessKey, ...(sessionToken === undefined ? {} : { sessionToken }) },
          ...(endpoint === undefined
            ? {}
            : {
                endpoint,
                forcePathStyle: true,
                capabilities: {
                  conditionalCreate: confirmed,
                  strongReadAfterWrite: confirmed,
                  consistentListing: confirmed,
                },
              }),
        }),
      ),
      Layer.provide(BunCrypto.layer),
    )
    return Layer.effectDiscard(Durability.activate).pipe(Layer.provideMerge(reconstructed))
  }),
)

const program = Effect.gen(function* () {
  const host = yield* Generalist.create({ agents: [agent] })
  const session = yield* host.sessions.create({ id: "guide-session" })
  const handle = yield* host.runs.start(session.id, agent, "Say hello", { idempotencyKey: "guide-message-1" })
  const first = yield* (yield* host.events.subscribe(session.id)).pipe(Stream.take(1), Stream.runHead)
  const encoded = yield* Server.eventCodec.encode(Option.getOrThrow(first))
  yield* Console.log(
    `admitted ${handle.id}; first Server event: ${first.pipe(
      Option.map((event) => event._tag),
      Option.getOrUndefined,
    )}; wire bytes: ${encoded.length}`,
  )
})

const runtime = ManagedRuntime.make(Layer.merge(runtimeLayer, agentServices))
try {
  await runtime.runPromise(program)
} finally {
  await runtime.dispose()
}
