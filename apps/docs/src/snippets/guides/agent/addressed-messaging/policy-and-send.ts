import { Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address, AgentDirectory, ExecutableResolver, Mailbox, Messaging, Runtime } from "tenetkit/runtime"

/**
 * Cross-session addressing is off by default. TenetKit always allows self, parent, direct child, and
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

export const runtimeLayer = (resolver: ExecutableResolver.Interface): Layer.Layer<Runtime.Runtime> =>
  Runtime.layerMemory({
    resolver,
    addresses: [],
    messagingPolicy,
    mailboxBounds: { maxPending: 64, maxPendingBytes: 262_144, maxPerWindow: 16, windowMillis: 60_000 },
  })

const text = (value: string) =>
  Prompt.fromMessages([Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: value })] })])

/** `fromRunId`, not a sender Address: TenetKit resolves the sender from its Run record. */
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
