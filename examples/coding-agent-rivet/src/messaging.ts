import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { ToolContext } from "generalist"
import { AgentDirectory, Errors, Mailbox, Messaging, Runtime } from "generalist/runtime"

const sendParentNote = Tool.make("send_specialist_note", {
  description: "Send one finding to the parent under a stable command identity.",
  parameters: Schema.Struct({ idempotencyKey: Schema.NonEmptyString, message: Schema.NonEmptyString }),
  success: Mailbox.MessageReceipt,
  failure: Messaging.SendMessageError,
  failureMode: "return",
  dependencies: [Messaging.AgentMessaging, ToolContext.ToolContext],
})

export const specialistMessagingToolkit = Toolkit.make(sendParentNote)
export const specialistMessagingLayer = specialistMessagingToolkit.toLayer({
  send_specialist_note: ({ idempotencyKey, message }) =>
    Effect.gen(function* () {
      const messaging = yield* Messaging.AgentMessaging
      const current = yield* messaging.identity
      if (current.parentRunId === undefined) {
        return yield* Errors.RuntimeUnavailable.make({ message: "A specialist note requires a parent Run" })
      }
      return yield* messaging.send({
        to: AgentDirectory.runAddress(current.parentRunId),
        idempotencyKey,
        prompt: message,
      })
    }),
})

export const sendSpecialistNote = (input: {
  readonly fromRunId: string
  readonly parentRunId: string
  readonly idempotencyKey: string
  readonly message: string
}): Effect.Effect<import("generalist/runtime").Mailbox.MessageReceipt, Runtime.SendMessageError, Runtime.Runtime> =>
  Runtime.Runtime.use((runtime) =>
    runtime.sendMessage({
      fromRunId: input.fromRunId,
      to: AgentDirectory.runAddress(input.parentRunId),
      idempotencyKey: input.idempotencyKey,
      prompt: input.message,
    }),
  )
