import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import {
  applyConversationUpdate,
  type Conversation,
  type ConversationEntry,
} from "../../../../src/runtime/session/conversation.js"
import { conversationEntries } from "../../../../src/unstable/foldkit/chat/conversation.js"

const user: ConversationEntry = {
  id: "user",
  parentId: null,
  messages: [Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "question" })] })],
}
const answer = (id: string, parentId: string, text: string): ConversationEntry => ({
  id,
  parentId,
  messages: [Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text })] })],
})

describe("Committed conversation projection", () => {
  it("applies append and branch updates by original identity and refuses stale or missing parents", () => {
    const original: Conversation = { leafId: "answer", entries: [user, answer("answer", "user", "old answer")] }
    const branch = applyConversationUpdate({
      conversation: original,
      update: {
        previousLeafId: "answer",
        leafId: "replacement",
        afterEntryId: "user",
        entries: [answer("replacement", "user", "new answer")],
      },
    })
    expect(Option.isSome(branch)).toBe(true)
    if (Option.isNone(branch)) return
    expect(conversationEntries(branch.value)).toEqual([
      { _tag: "UserEntry", text: "question" },
      { _tag: "AssistantEntry", text: "new answer", reasoning: null },
    ])
    expect(
      Option.isNone(
        applyConversationUpdate({
          conversation: branch.value,
          update: { previousLeafId: "answer", leafId: "stale", afterEntryId: "user", entries: [] },
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        applyConversationUpdate({
          conversation: original,
          update: { previousLeafId: "answer", leafId: "missing", afterEntryId: "unknown", entries: [] },
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        applyConversationUpdate({
          conversation: original,
          update: { previousLeafId: "answer", leafId: "user", afterEntryId: "answer", entries: [user] },
        }),
      ),
    ).toBe(true)
  })

  it("does not merge reused tool call IDs from different committed entries", () => {
    const entries: Array<ConversationEntry> = []
    for (const id of ["first", "second"]) {
      entries.push({
        id: `${id}-call`,
        parentId: entries.at(-1)?.id ?? null,
        messages: [
          Prompt.makeMessage("assistant", {
            content: [
              Prompt.makePart("tool-call", {
                id: "search-1",
                name: "search",
                params: { query: id },
                providerExecuted: false,
              }),
            ],
          }),
        ],
      })
      entries.push({
        id: `${id}-result`,
        parentId: `${id}-call`,
        messages: [
          Prompt.makeMessage("tool", {
            content: [
              Prompt.makePart("tool-result", {
                id: "search-1",
                name: "search",
                result: id,
                isFailure: false,
                providerExecuted: false,
              }),
            ],
          }),
        ],
      })
    }
    const projected = conversationEntries({ leafId: "second-result", entries })
    expect(projected).toHaveLength(2)
    expect(projected).toMatchObject([
      {
        callId: '["first-call","search-1"]',
        params: { query: "first" },
        outcome: { _tag: "Completed", result: "first" },
      },
      {
        callId: '["second-call","search-1"]',
        params: { query: "second" },
        outcome: { _tag: "Completed", result: "second" },
      },
    ])
  })
})
