import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { AgentMessaging } from "./messaging/service.js"
import { MessageReceipt } from "./messaging/mailbox.js"
import { ToolContext } from "../core/tools/tool-context.js"
import { AdmissionPolicy as AdmissionPolicySchema, SteeringEntry } from "./run/steering.js"

export {
  AdmissionPolicy,
  ExecutionContinuation,
  InboxFull,
  MessageSource,
  SteeringEntry,
  SteeringReceipt,
  decodeContinuation,
  defaultCapacity,
  defaultMaxPendingBytes,
  digest,
  encodeContinuation,
  promptBytes,
} from "./run/steering.js"

const ToolFailure = Schema.Struct({ message: Schema.String })
const SendParameters = Schema.Struct({
  message: Schema.String.check(Schema.isNonEmpty()),
  policy: Schema.optionalKey(AdmissionPolicySchema),
})
const SendChildParameters = Schema.Struct({
  childRunId: Schema.String.check(Schema.isNonEmpty()),
  ...SendParameters.fields,
})
const ListParameters = Schema.Struct({
  limit: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(64))),
})

const sendToChild = Tool.make("send_to_child", {
  description: "Send a message to one direct child Run.",
  parameters: SendChildParameters,
  success: MessageReceipt,
  failure: ToolFailure,
  failureMode: "return",
  dependencies: [AgentMessaging, ToolContext],
})
const sendToParent = Tool.make("send_to_parent", {
  description: "Send a message to this Run's direct parent.",
  parameters: SendParameters,
  success: MessageReceipt,
  failure: ToolFailure,
  failureMode: "return",
  dependencies: [AgentMessaging, ToolContext],
})
const listInbox = Tool.make("list_inbox", {
  description: "List this Run's pending admitted messages in delivery order.",
  parameters: ListParameters,
  success: Schema.Array(SteeringEntry),
  failure: ToolFailure,
  failureMode: "return",
  dependencies: [AgentMessaging, ToolContext],
})
const steeringToolkit = Toolkit.make(sendToChild, sendToParent, listInbox)

/** Effect AI tools for messaging direct children and parents and inspecting this Run's inbox. */
export const toolkit = () => steeringToolkit

/** Handlers for `toolkit()`, backed by the Runtime-owned messaging service. */
export const layer = steeringToolkit.toLayer({
  send_to_child: (input, context) =>
    Effect.gen(function* () {
      const messaging = yield* AgentMessaging
      const current = yield* messaging.identity
      const child = (yield* messaging.directory).find(
        (entry) => entry.runId === input.childRunId && entry.parentRunId === current.runId,
      )
      if (child === undefined) return yield* Effect.fail({ message: `Run ${input.childRunId} is not a direct child` })
      return yield* messaging.send({
        to: child.address,
        idempotencyKey: `steering:${context.toolCallId ?? input.childRunId}`,
        prompt: input.message,
        ...(input.policy === undefined ? undefined : { policy: input.policy }),
      })
    }).pipe(Effect.mapError((error) => ({ message: error.message }))),
  send_to_parent: (input, context) =>
    Effect.gen(function* () {
      const messaging = yield* AgentMessaging
      const current = yield* messaging.identity
      const parent = (yield* messaging.directory).find((entry) => entry.runId === current.parentRunId)
      if (parent === undefined) return yield* Effect.fail({ message: "This Run has no direct parent" })
      return yield* messaging.send({
        to: parent.address,
        idempotencyKey: `steering:${context.toolCallId ?? parent.runId}`,
        prompt: input.message,
        ...(input.policy === undefined ? undefined : { policy: input.policy }),
      })
    }).pipe(Effect.mapError((error) => ({ message: error.message }))),
  list_inbox: (input) =>
    Effect.flatMap(AgentMessaging, (messaging) => messaging.inbox({ limit: input.limit ?? 64 })).pipe(
      Effect.mapError((error) => ({ message: error.message })),
    ),
})
