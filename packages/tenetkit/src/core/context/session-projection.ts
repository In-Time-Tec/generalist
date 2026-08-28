import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { projectTranscript } from "./memory.js"
import type { Entry, SkillEntry } from "./session.js"

/** @experimental Model context cannot be admitted while framework tool calls lack outcomes. */
export class ContextInvalid extends Schema.TaggedError<ContextInvalid>()("tenetkit/core/ContextInvalid", {
  issues: Schema.Array(
    Schema.Struct({
      toolCallId: Schema.String,
      reason: Schema.Literals(["unresolved", "duplicate-call", "duplicate-result", "name-mismatch"]),
    }),
  ),
}) {}

interface ToolCallState {
  readonly call: Prompt.ToolCallPart
  resultCount: number
}

const inspectToolContext = (prompt: Prompt.Prompt) => {
  const calls = new Map<string, ToolCallState>()
  const issues: Array<ContextInvalid["issues"][number]> = []
  for (const message of prompt.content) {
    if (Schema.is(Schema.String)(message.content)) continue
    for (const part of message.content) {
      if (part.type === "tool-call" && part.providerExecuted !== true) {
        const state = calls.get(part.id)
        if (state !== undefined && state.resultCount === 0) {
          issues.push({ toolCallId: part.id, reason: "duplicate-call" })
        } else {
          calls.set(part.id, { call: part, resultCount: 0 })
        }
      }
      if (part.type === "tool-result") {
        const state = calls.get(part.id)
        if (state === undefined) continue
        if (state.call.name !== part.name) {
          issues.push({ toolCallId: part.id, reason: "name-mismatch" })
          continue
        }
        state.resultCount += 1
        if (state.resultCount > 1) issues.push({ toolCallId: part.id, reason: "duplicate-result" })
      }
    }
  }
  const unresolved = [...calls.values()].filter((state) => state.resultCount === 0).map((state) => state.call)
  issues.push(...unresolved.map((call) => ({ toolCallId: call.id, reason: "unresolved" as const })))
  return { unresolved, issues }
}

/** @experimental Framework tool calls in model context that do not yet have a corresponding result. */
export const unresolvedToolCalls = (prompt: Prompt.Prompt): ReadonlyArray<Prompt.ToolCallPart> =>
  inspectToolContext(prompt).unresolved

/** @experimental Reject model context unless every framework tool call has exactly one matching result. */
export const validateContext = (prompt: Prompt.Prompt): Effect.Effect<void, ContextInvalid> => {
  const inspection = inspectToolContext(prompt)
  return inspection.issues.length === 0 ? Effect.void : Effect.fail(ContextInvalid.make({ issues: inspection.issues }))
}

const messageFromText = (role: "user" | "system", text: string): Prompt.Message =>
  role === "system"
    ? Prompt.makeMessage("system", { content: text })
    : Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const branchSummaryMessage = (summary: string): Prompt.Message =>
  messageFromText("system", `<abandoned-branch-summary>\n${summary}\n</abandoned-branch-summary>`)

const attributeValue = (value: string): string => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")

const memoryMessage = (items: ReadonlyArray<string>): Prompt.Message =>
  messageFromText("system", `<memory>\n${items.join("\n")}\n</memory>`)

const skillMessage = (entry: SkillEntry): Prompt.Message =>
  messageFromText("system", `<skill name="${attributeValue(entry.name)}">\n${entry.body}\n</skill>`)

const messagesFromEntry = (entry: Entry): ReadonlyArray<Prompt.Message> => {
  switch (entry._tag) {
    case "Message":
    case "Steering":
      return [entry.message]
    case "ModelResponse":
      return Prompt.fromResponseParts(entry.content).content
    case "ToolCall":
      return [Prompt.makeMessage("assistant", { content: [entry.part] })]
    case "ToolResult":
      return [Prompt.makeMessage("tool", { content: [entry.part] })]
    case "Memory":
      return [memoryMessage(entry.items)]
    case "Skill":
      return [skillMessage(entry)]
    case "BranchSummary":
      return [branchSummaryMessage(entry.summary)]
    case "Handoff":
    case "Compaction":
      return []
  }
}

const projectedMessages = (path: ReadonlyArray<Entry>): ReadonlyArray<Prompt.Message> => {
  const boundaryIndex = path.findLastIndex((entry) => entry._tag === "Compaction" || entry._tag === "Handoff")
  const boundary = boundaryIndex === -1 ? undefined : path[boundaryIndex]
  const messages: Array<Prompt.Message> =
    boundary?._tag === "Compaction" || boundary?._tag === "Handoff" ? [...boundary.projectedHistory.content] : []
  const entries = boundaryIndex === -1 ? path : path.slice(boundaryIndex + 1)

  for (const entry of entries) {
    messages.push(...messagesFromEntry(entry))
  }

  return messages
}

/** @experimental Purely projects a root-to-leaf session path into model context. */
export const buildContext = (path: ReadonlyArray<Entry>): Prompt.Prompt => Prompt.fromMessages(projectedMessages(path))

/** @experimental Purely projects a lossless path for memory retention. */
export const buildMemoryContext = (path: ReadonlyArray<Entry>): Prompt.Prompt => {
  const messages = path.flatMap((entry): ReadonlyArray<Prompt.Message> => {
    switch (entry._tag) {
      case "Message":
        return [entry.message]
      case "ModelResponse":
        return Prompt.fromResponseParts(entry.content).content
      case "ToolCall":
        return [Prompt.makeMessage("assistant", { content: [entry.part] })]
      case "ToolResult":
        return [Prompt.makeMessage("tool", { content: [entry.part] })]
      case "Steering":
        return [entry.message]
      case "Memory":
      case "Skill":
      case "Handoff":
      case "Compaction":
      case "BranchSummary":
        return []
    }
  })
  return projectTranscript(Prompt.fromMessages(messages))
}
