import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Memory, Session } from "../src/index"
import { ItLayer } from "./it-layer"

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
  it("excludes exact checkpoints from ordinary append input", () => {
    const excluded: Extract<Session.AppendInput, { readonly version: 2 }> extends never ? true : false = true
    expect(excluded).toBe(true)
  })

  ItLayer.make(
    it,
    "starts empty",
    () =>
      [
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore

          expect(yield* store.leaf).toBeNull()
          expect(yield* store.path()).toEqual([])
          expect(Session.buildContext([]).content).toEqual([])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "appends linear messages and projects them in order",
    () =>
      [
        Session.layerMemory,
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
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "moves the leaf pointer to fork a branch",
    () =>
      [
        Session.layerMemory,
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
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "projects the last compaction as a checkpoint plus kept entries",
    () =>
      [
        Session.layerMemory,
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
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "projects lossless memory context across compaction without recalled or synthetic entries",
    () =>
      [
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore

          const first = yield* store.append({ _tag: "Message", message: user("authored before") })
          yield* store.append({
            _tag: "Message",
            message: Memory.messageFromRecall([Prompt.makePart("text", { text: "recalled" })]),
          })
          const kept = yield* store.append({ _tag: "Message", message: assistant("model before") })
          yield* store.append({
            _tag: "Compaction",
            summary: "summary containing recalled and authored context",
            firstKeptEntryId: kept.id,
          })
          yield* store.append({ _tag: "Message", message: user("authored after") })
          const path = yield* store.path()

          expect(first.id).toBe("0")
          expect(promptTexts(Session.buildMemoryContext(path))).toEqual([
            "authored before",
            "model before",
            "authored after",
          ])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "uses the last compaction on a path",
    () =>
      [
        Session.layerMemory,
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
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "renders branch summaries as system notes",
    () =>
      [
        Session.layerMemory,
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
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "projects memory, skills, steering, tool calls, tool results, and handoffs as prompt context",
    () =>
      [
        Session.layerMemory,
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
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "fails typed for unknown leaves and invalid compactions",
    () =>
      [
        Session.layerMemory,
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
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "appends exact checkpoints idempotently and rejects identity or leaf conflicts",
    () =>
      [
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const source = yield* store.append({ _tag: "Message", message: user("source") })
          const id = yield* store.reserveEntryId
          const prepared: Session.PreparedCheckpoint = {
            id,
            parentId: source.id,
            projectedHistory: Prompt.fromMessages([user("exact projection")]),
          }

          const appended = yield* store.appendCheckpoint(prepared)
          const repeated = yield* store.appendCheckpoint(prepared)
          const reused = yield* Effect.flip(
            store.appendCheckpoint({ ...prepared, projectedHistory: Prompt.fromMessages([user("different")]) }),
          )
          const staleId = yield* store.reserveEntryId
          const stale = yield* Effect.flip(
            store.appendCheckpoint({
              id: staleId,
              parentId: source.id,
              projectedHistory: Prompt.fromMessages([user("stale")]),
            }),
          )

          expect(appended._tag).toBe("Appended")
          expect(repeated._tag).toBe("AlreadyPresent")
          expect(reused._tag).toBe("@batonfx/core/SessionConflict")
          expect(stale._tag).toBe("@batonfx/core/SessionConflict")
          if (reused._tag === "@batonfx/core/SessionConflict") expect(reused.reason).toBe("checkpoint-id-reused")
          if (stale._tag === "@batonfx/core/SessionConflict") expect(stale.reason).toBe("stale-leaf")
          expect((yield* store.path()).filter((entry) => entry._tag === "Compaction")).toHaveLength(1)
          expect(promptTexts(Session.buildContext(yield* store.path()))).toEqual(["exact projection"])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "retries an ambiguously interrupted checkpoint append without duplication",
    () =>
      [
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const source = yield* store.append({ _tag: "Message", message: user("source") })
          const prepared: Session.PreparedCheckpoint = {
            id: yield* store.reserveEntryId,
            parentId: source.id,
            projectedHistory: Prompt.fromMessages([user("committed projection")]),
          }
          const committed = yield* Deferred.make<void>()
          const append = store.appendCheckpoint(prepared).pipe(
            Effect.tap(() => Deferred.succeed(committed, undefined)),
            Effect.andThen(Effect.never),
          )
          const fiber = yield* Effect.forkChild(append, { startImmediately: true })

          yield* Deferred.await(committed)
          yield* Fiber.interrupt(fiber)
          const retried = yield* store.appendCheckpoint(prepared)

          expect(retried._tag).toBe("AlreadyPresent")
          expect((yield* store.path()).filter((entry) => entry._tag === "Compaction")).toHaveLength(1)
          expect(promptTexts(Session.buildContext(yield* store.path()))).toEqual(["committed projection"])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "matches checkpoint identity structurally across reordered object keys",
    () =>
      [
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const source = yield* store.append({ _tag: "Message", message: user("source") })
          const toolProjection = (params: Readonly<Record<string, number>>) =>
            Prompt.fromMessages([
              Prompt.makeMessage("assistant", {
                content: [
                  Prompt.makePart("tool-call", {
                    id: "structural",
                    name: "echo",
                    params,
                    providerExecuted: true,
                  }),
                ],
              }),
            ])
          const prepared: Session.PreparedCheckpoint = {
            id: yield* store.reserveEntryId,
            parentId: source.id,
            projectedHistory: toolProjection({ first: 1, second: 2 }),
          }
          yield* store.appendCheckpoint(prepared)

          const retried = yield* store.appendCheckpoint({
            ...prepared,
            projectedHistory: toolProjection({ second: 2, first: 1 }),
          })

          expect(retried._tag).toBe("AlreadyPresent")
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "keeps active descendants on delayed retry and rejects checkpoints from abandoned branches",
    () =>
      [
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const source = yield* store.append({ _tag: "Message", message: user("source") })
          const prepared: Session.PreparedCheckpoint = {
            id: yield* store.reserveEntryId,
            parentId: source.id,
            projectedHistory: Prompt.fromMessages([user("checkpoint")]),
          }
          yield* store.appendCheckpoint(prepared)
          const descendant = yield* store.append(
            { _tag: "Message", message: user("descendant") },
            { expectedLeafId: prepared.id },
          )

          const delayed = yield* store.appendCheckpoint(prepared)

          expect(delayed._tag).toBe("AlreadyPresent")
          expect(delayed.leafId).toBe(descendant.id)
          expect(promptTexts(Session.buildContext(yield* store.path(delayed.leafId)))).toEqual([
            "checkpoint",
            "descendant",
          ])

          yield* store.setLeaf(source.id)
          yield* store.append({ _tag: "Message", message: user("other branch") }, { expectedLeafId: source.id })
          const abandoned = yield* Effect.flip(store.appendCheckpoint(prepared))

          expect(abandoned._tag).toBe("@batonfx/core/SessionConflict")
          if (abandoned._tag === "@batonfx/core/SessionConflict") {
            expect(abandoned.reason).toBe("checkpoint-not-on-active-path")
          }
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "testLayer provides an exact implementation",
    () =>
      [
        Session.testLayer({
          reserveEntryId: Effect.succeed("reserved"),
          append: () => Effect.die("unused"),
          appendCheckpoint: () => Effect.die("unused"),
          path: () => Effect.succeed([]),
          setLeaf: () => Effect.void,
          leaf: Effect.succeed("leaf"),
        }),
        Effect.gen(function* () {
          const expected = yield* Session.SessionStore

          expect(yield* expected.leaf).toBe("leaf")
          expect(yield* expected.path()).toEqual([])
        }),
      ] as const,
  )
})
