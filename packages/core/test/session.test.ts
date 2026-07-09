import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Session } from "../src/index"

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const assistant = (text: string): Prompt.Message =>
  Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text })] })

const promptTexts = (prompt: Prompt.Prompt): ReadonlyArray<string> =>
  prompt.content.map((message) => {
    if (message.role === "system") return message.content
    return message.content.map((part) => (part.type === "text" ? part.text : "")).join("")
  })

describe("Session", () => {
  it.effect("starts empty", () =>
    Effect.gen(function* () {
      const store = yield* Session.SessionStore

      expect(yield* store.leaf).toBeNull()
      expect(yield* store.path()).toEqual([])
      expect(Session.buildContext([]).content).toEqual([])
    }).pipe(Effect.provide(Session.memoryLayer)),
  )

  it.effect("appends linear messages and projects them in order", () =>
    Effect.gen(function* () {
      const store = yield* Session.SessionStore

      const first = yield* store.append({ _tag: "Message", message: user("one") })
      const second = yield* store.append({ _tag: "Message", message: assistant("two") })
      const third = yield* store.append({ _tag: "Message", message: user("three") })
      const path = yield* store.path()

      expect([first.id, second.id, third.id]).toEqual(["0", "1", "2"])
      expect([first.parentId, second.parentId, third.parentId]).toEqual([null, "0", "1"])
      expect(path).toEqual([first, second, third])
      expect(promptTexts(Session.buildContext(path))).toEqual(["one", "two", "three"])
    }).pipe(Effect.provide(Session.memoryLayer)),
  )

  it.effect("moves the leaf pointer to fork a branch", () =>
    Effect.gen(function* () {
      const store = yield* Session.SessionStore

      const first = yield* store.append({ _tag: "Message", message: user("A") })
      const abandoned = yield* store.append({ _tag: "Message", message: user("B") })
      yield* store.setLeaf(first.id)
      const fork = yield* store.append({ _tag: "Message", message: assistant("C") })

      expect(yield* store.leaf).toBe(fork.id)
      expect(yield* store.path()).toEqual([first, fork])
      expect(yield* store.path(abandoned.id)).toEqual([first, abandoned])
      expect(promptTexts(Session.buildContext(yield* store.path()))).toEqual(["A", "C"])
    }).pipe(Effect.provide(Session.memoryLayer)),
  )

  it.effect("projects the last compaction as a checkpoint plus kept entries", () =>
    Effect.gen(function* () {
      const store = yield* Session.SessionStore

      const first = yield* store.append({ _tag: "Message", message: user("m1") })
      const second = yield* store.append({ _tag: "Message", message: user("m2") })
      const third = yield* store.append({ _tag: "Message", message: user("m3") })
      const fourth = yield* store.append({ _tag: "Message", message: user("m4") })
      const fifth = yield* store.append({ _tag: "Message", message: user("m5") })
      const compaction = yield* store.append({
        _tag: "Compaction",
        summary: "summary m1-m3",
        firstKeptEntryId: fourth.id,
      })
      const path = yield* store.path()

      expect(path).toEqual([first, second, third, fourth, fifth, compaction])
      expect(promptTexts(Session.buildContext(path))).toEqual([
        "<conversation-checkpoint>\nsummary m1-m3\n</conversation-checkpoint>",
        "m4",
        "m5",
      ])
    }).pipe(Effect.provide(Session.memoryLayer)),
  )

  it.effect("uses the last compaction on a path", () =>
    Effect.gen(function* () {
      const store = yield* Session.SessionStore

      yield* store.append({ _tag: "Message", message: user("m1") })
      const second = yield* store.append({ _tag: "Message", message: user("m2") })
      yield* store.append({ _tag: "Compaction", summary: "old summary", firstKeptEntryId: second.id })
      const third = yield* store.append({ _tag: "Message", message: user("m3") })
      yield* store.append({ _tag: "Compaction", summary: "new summary", firstKeptEntryId: third.id })

      expect(promptTexts(Session.buildContext(yield* store.path()))).toEqual([
        "<conversation-checkpoint>\nnew summary\n</conversation-checkpoint>",
        "m3",
      ])
    }).pipe(Effect.provide(Session.memoryLayer)),
  )

  it.effect("renders branch summaries as system notes", () =>
    Effect.gen(function* () {
      const store = yield* Session.SessionStore

      yield* store.append({ _tag: "Message", message: user("main") })
      yield* store.append({ _tag: "BranchSummary", summary: "alternate branch tried X" })
      yield* store.append({ _tag: "Message", message: assistant("continue") })

      expect(promptTexts(Session.buildContext(yield* store.path()))).toEqual([
        "main",
        "<abandoned-branch-summary>\nalternate branch tried X\n</abandoned-branch-summary>",
        "continue",
      ])
    }).pipe(Effect.provide(Session.memoryLayer)),
  )

  it.effect("projects memory, skills, steering, tool calls, tool results, and handoffs as prompt context", () =>
    Effect.gen(function* () {
      const store = yield* Session.SessionStore
      const toolCall = Prompt.makePart("tool-call", {
        id: "call-search",
        name: "web_search",
        params: { query: "Baton" },
        providerExecuted: false,
      })
      const toolResult = Prompt.makePart("tool-result", {
        id: "call-search",
        name: "web_search",
        isFailure: false,
        result: { results: ["Baton docs"] },
      })

      yield* store.append({ _tag: "Memory", items: ["customer is enterprise"] })
      yield* store.append({ _tag: "Skill", name: "research", body: "Use primary sources." })
      yield* store.append({ _tag: "Steering", message: user("Prioritize docs.") })
      yield* store.append({ _tag: "ToolCall", part: toolCall })
      yield* store.append({ _tag: "ToolResult", part: toolResult })
      yield* store.append({ _tag: "Handoff", target: "reviewer", summary: "Reviewer found no issues." })
      const path = yield* store.path()

      const prompt = Session.buildContext(path)

      expect(prompt.content.map((message) => message.role)).toEqual([
        "system",
        "system",
        "user",
        "assistant",
        "tool",
        "system",
      ])
      expect(promptTexts(prompt)).toEqual([
        "<memory>\ncustomer is enterprise\n</memory>",
        '<skill name="research">\nUse primary sources.\n</skill>',
        "Prioritize docs.",
        "",
        "",
        '<handoff target="reviewer">\nReviewer found no issues.\n</handoff>',
      ])
      expect(prompt.content[3]?.content).toEqual([toolCall])
      expect(prompt.content[4]?.content).toEqual([toolResult])
    }).pipe(Effect.provide(Session.memoryLayer)),
  )

  it.effect("fails typed for unknown leaves and invalid compactions", () =>
    Effect.gen(function* () {
      const store = yield* Session.SessionStore

      const setLeafFailure = yield* Effect.flip(store.setLeaf("missing"))
      const pathFailure = yield* Effect.flip(store.path("missing"))
      yield* store.append({ _tag: "Message", message: user("m1") })
      const compactionFailure = yield* Effect.flip(
        store.append({ _tag: "Compaction", summary: "bad", firstKeptEntryId: "missing" }),
      )

      expect(setLeafFailure._tag).toBe("@batonfx/core/SessionStoreError")
      expect(pathFailure._tag).toBe("@batonfx/core/SessionStoreError")
      expect(compactionFailure._tag).toBe("@batonfx/core/SessionStoreError")
    }).pipe(Effect.provide(Session.memoryLayer)),
  )

  it.effect("testLayer provides an exact implementation", () =>
    Effect.gen(function* () {
      const expected = yield* Session.SessionStore

      expect(yield* expected.leaf).toBe("leaf")
      expect(yield* expected.path()).toEqual([])
    }).pipe(
      Effect.provide(
        Session.testLayer({
          append: () => Effect.die("unused"),
          path: () => Effect.succeed([]),
          setLeaf: () => Effect.void,
          leaf: Effect.succeed("leaf"),
        }),
      ),
    ),
  )
})
