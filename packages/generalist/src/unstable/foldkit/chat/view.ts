import { Schema } from "effect"
import type { ChatEntry, ConversationItem, Model, PromptInputStatus, RunState, ToolStatus } from "./service.js"

const jsonText = (value: typeof Schema.Unknown.Type): string => {
  const decoded = Schema.decodeUnknownSync(Schema.Unknown)(value)
  try {
    return JSON.stringify(decoded, null, 2) ?? "undefined"
  } catch {
    return String(decoded)
  }
}

/** @experimental */
export const promptInputStatusOf = (run: RunState): PromptInputStatus => {
  switch (run._tag) {
    case "Idle":
      return "idle"
    case "Running":
      return "streaming"
    case "AwaitingApproval":
      return "submitted"
    case "Failed":
      return "error"
  }
}

/** @experimental */
export const toolStatusOf = (entry: Extract<ChatEntry, { readonly _tag: "ToolEntry" }>): ToolStatus => {
  switch (entry.outcome._tag) {
    case "Pending":
      return "input-available"
    case "Completed":
      return entry.outcome.isFailure ? "output-error" : "output-available"
  }
}

const conversationItemFor = (entry: ChatEntry, index: number): ConversationItem => {
  switch (entry._tag) {
    case "UserEntry":
      return { _tag: "UserConversationItem", key: `entry-${index}-user`, align: "end", entry }
    case "AssistantEntry":
      return { _tag: "AssistantConversationItem", key: `entry-${index}-assistant`, align: "start", entry }
    case "ToolEntry":
      return {
        _tag: "ToolConversationItem",
        key: `tool-${entry.callId}`,
        align: "start",
        entry,
        status: toolStatusOf(entry),
        input: jsonText(entry.params),
      }
  }
}

/** @experimental */
export const conversationItems = (model: Model): ReadonlyArray<ConversationItem> => {
  const entries = model.entries.map(conversationItemFor)
  const preview =
    model.preview === null || (model.preview.text.length === 0 && model.preview.reasoning.length === 0)
      ? []
      : [
          {
            _tag: "PreviewConversationItem" as const,
            key: `preview-${model.preview.runId}`,
            align: "start" as const,
            entry: {
              _tag: "AssistantEntry" as const,
              text: model.preview.text,
              reasoning: model.preview.reasoning.length === 0 ? null : model.preview.reasoning,
            },
            attemptFence: model.preview.attemptFence,
            sequence: model.preview.sequence,
          },
        ]
  const waiting =
    model.run._tag === "Running" && preview.length === 0
      ? [{ _tag: "WaitingConversationItem" as const, key: "waiting-assistant", align: "start" as const }]
      : []
  const approval =
    model.run._tag === "AwaitingApproval"
      ? [
          {
            _tag: "ApprovalConversationItem" as const,
            key: `approval-${model.run.token}`,
            align: "start" as const,
            token: model.run.token,
            toolName: model.run.toolName,
            params: model.run.params,
          },
        ]
      : []
  const failure =
    model.run._tag === "Failed"
      ? [
          {
            _tag: "FailureConversationItem" as const,
            key: "run-failure",
            align: "start" as const,
            message: model.run.message,
          },
        ]
      : []
  return [...entries, ...preview, ...waiting, ...approval, ...failure]
}
