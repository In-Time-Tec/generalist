import { BunCrypto } from "@effect/platform-bun"
import { Config, Effect, Layer, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import * as Durability from "generalist/durability"
import * as S3 from "generalist/durability/s3"
import { Address, AgentDirectory, ExecutableResolver, Mailbox, Messaging, Runtime } from "generalist/runtime"
/**
 * Cross-session addressing is off by default. Generalist always allows self, parent, direct child, and
 * sibling-under-one-parent from durable parentage; everything else is this one host decision.
 */
const linkedThreads = new Map<string, ReadonlySet<string>>([["session:planner", new Set(["session:reviewer"])]])

const messagingPolicy = Messaging.Policy.make({
  // Directional: allowing planner -> reviewer does not allow reviewer -> planner.
  allow: (input) => Effect.succeed(linkedThreads.get(input.sender.sessionId)?.has(input.target.sessionId) === true),
  // Each announced address is still put through `allow` before it is listed.
  discover: (sender) =>
    Effect.succeed(
      [...(linkedThreads.get(sender.sessionId) ?? [])].map((sessionId) =>
        Address.make(`session:${encodeURIComponent(sessionId)}`),
      ),
    ),
})

export const runtimeLayer = (resolver: ExecutableResolver.Service) =>
  Layer.unwrap(Effect.gen(function* () {
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
    const reconstructed = Durability.layer({ environment, tenant, partition, addresses: [], messagingPolicy }).pipe(
      Layer.provide(Layer.succeed(ExecutableResolver.ExecutableResolver, resolver)),
      Layer.provide(S3.layer({
        bucket,
        region,
        credentials: { accessKeyId, secretAccessKey, ...(sessionToken === undefined ? {} : { sessionToken }) },
        ...(endpoint === undefined ? {} : {
          endpoint,
          forcePathStyle: true,
          capabilities: { conditionalCreate: confirmed, strongReadAfterWrite: confirmed, consistentListing: confirmed },
        }),
      })),
      Layer.provide(BunCrypto.layer),
    )
    return Layer.effectDiscard(Durability.activate).pipe(Layer.provideMerge(reconstructed))
  }))

const text = (value: string) =>
  Prompt.fromMessages([Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: value })] })])

/** `fromRunId`, not a sender Address: Generalist resolves the sender from its Run record. */
export const ping = (input: {
  readonly fromRunId: string
  readonly targetSessionId: string
}): Effect.Effect<Mailbox.MessageReceipt, Runtime.SendMessageError, Runtime.Runtime> =>
  Runtime.Runtime.use((runtime) =>
    runtime.sendMessage({
      fromRunId: input.fromRunId,
      to: Address.make(`session:${encodeURIComponent(input.targetSessionId)}`),
      idempotencyKey: `ping:${input.targetSessionId}`,
      prompt: text("status?"),
    }),
  )

/** Every address this Run may reach: durable relations plus policy-announced, authorized peers. */
export const reachable = (
  runId: string,
): Effect.Effect<ReadonlyArray<AgentDirectory.DirectoryEntry>, Runtime.DirectoryError, Runtime.Runtime> =>
  Runtime.Runtime.use((runtime) => runtime.directory(runId))
