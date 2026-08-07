import { Array } from "effect"
import { Prompt } from "effect/unstable/ai"
import { projectTranscript } from "./memory.js"
import type { CompactionEntry, Entry, HandoffEntry, SkillEntry } from "./session.js"

const messageFromText = (role: "user" | "system", text: string): Prompt.Message =>
  role === "system"
    ? Prompt.makeMessage("system", { content: text })
    : Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const checkpointMessage = (summary: string): Prompt.Message =>
  messageFromText("user", `<conversation-checkpoint>\n${summary}\n</conversation-checkpoint>`)

const branchSummaryMessage = (summary: string): Prompt.Message =>
  messageFromText("system", `<abandoned-branch-summary>\n${summary}\n</abandoned-branch-summary>`)

const attributeValue = (value: string): string => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")

const memoryMessage = (items: ReadonlyArray<string>): Prompt.Message =>
  messageFromText("system", `<memory>\n${items.join("\n")}\n</memory>`)

const skillMessage = (entry: SkillEntry): Prompt.Message =>
  messageFromText("system", `<skill name="${attributeValue(entry.name)}">\n${entry.body}\n</skill>`)

const handoffMessage = (entry: HandoffEntry): Prompt.Message =>
  messageFromText("system", `<handoff target="${attributeValue(entry.target)}">\n${entry.summary}\n</handoff>`)

const projectedMessages = (path: ReadonlyArray<Entry>): ReadonlyArray<Prompt.Message> => {
  const compactionIndex = path.findLastIndex((entry) => entry._tag === "Compaction")
  const compaction = compactionIndex === -1 ? undefined : (path[compactionIndex] as CompactionEntry)
  const messages: Array<Prompt.Message> = compaction?.version === 2 ? [...compaction.projectedHistory.content] : []
  const keptIndex =
    compaction === undefined || compaction.version === 2
      ? -1
      : path.findIndex((entry) => entry.id === compaction.firstKeptEntryId)
  const entries =
    compactionIndex === -1
      ? path
      : compaction?.version === 2
        ? path.slice(compactionIndex + 1)
        : path.slice(keptIndex === -1 ? compactionIndex + 1 : keptIndex)

  if (compaction !== undefined && compaction.version !== 2) messages.push(checkpointMessage(compaction.summary))

  for (const entry of entries) {
    switch (entry._tag) {
      case "Message":
        messages.push(entry.message)
        break
      case "ToolCall":
        messages.push(Prompt.makeMessage("assistant", { content: [entry.part] }))
        break
      case "ToolResult":
        messages.push(Prompt.makeMessage("tool", { content: [entry.part] }))
        break
      case "Memory":
        messages.push(memoryMessage(entry.items))
        break
      case "Skill":
        messages.push(skillMessage(entry))
        break
      case "Steering":
        messages.push(entry.message)
        break
      case "Handoff":
        messages.push(handoffMessage(entry))
        break
      case "BranchSummary":
        messages.push(branchSummaryMessage(entry.summary))
        break
      case "Compaction":
        break
    }
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
