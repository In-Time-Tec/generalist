import { layerMemory } from "../../../src/core/context/session-memory.js"
import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Memory, ModelTelemetry, Session } from "../../../src/index"
import { ItLayer } from "../it-layer.js"

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
  ItLayer.make(
    it,
    "starts empty",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")

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
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")

          const first = yield* store.append({ _tag: "Message", message: user("one") }, { commandId: "fixture-51" })
          const second = yield* store.append(
            { _tag: "Message", message: assistant("two") },
            { commandId: "fixture-52" },
          )
          const third = yield* store.append({ _tag: "Message", message: user("three") }, { commandId: "fixture-53" })
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
    "pages a fixed leaf while effective reads stop at projection boundaries",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("paged")
          const appended = []
          for (let index = 0; index < 10; index += 1) {
            appended.push(
              yield* store.append(
                { _tag: "Message", message: user(`message-${index}`) },
                { commandId: `fixture-74-${index}` },
              ),
            )
          }
          const fixedLeaf = appended.at(-1)!.id
          let page = yield* store.pathPage({ leafId: fixedLeaf, limit: 3 })
          expect(page.entries.map((entry) => entry.id)).toEqual(["7", "8", "9"])
          expect(page).toMatchObject({ hasOlder: true, hasNewer: false })

          yield* store.append({ _tag: "Message", message: user("later-append") }, { commandId: "fixture-81" })
          const paged = [...page.entries]
          while (page.nextCursor !== undefined) {
            page = yield* store.pathPage({ leafId: fixedLeaf, cursor: page.nextCursor, limit: 3 })
            paged.unshift(...page.entries)
          }
          expect(paged.map((entry) => entry.id)).toEqual(appended.map((entry) => entry.id))
          expect(paged.some((entry) => promptTexts(Session.buildContext([entry])).includes("later-append"))).toBe(false)

          const current = yield* store.leaf
          const checkpointId = yield* store.reserveEntryId("paged-checkpoint")
          const checkpoint = (yield* store.appendCheckpoint({
            id: checkpointId,
            parentId: current,
            projectedHistory: Prompt.fromMessages([user("projected")]),
            telemetry: [],
          })).checkpoint
          const suffix = yield* store.append(
            { _tag: "Message", message: assistant("suffix") },
            { commandId: "fixture-98" },
          )
          expect((yield* store.effectivePath()).map((entry) => entry.id)).toEqual([checkpoint.id, suffix.id])
          expect((yield* store.path()).length).toBeGreaterThan(2)
          expect(yield* store.latestCompaction()).toEqual(checkpoint)

          const handoff = yield* store.append(
            {
              _tag: "Handoff",
              handoffId: "paged-handoff",
              target: "specialist",
              projectedHistory: Prompt.fromMessages([user("handoff projection")]),
            },
            { commandId: "fixture-103" },
          )
          const afterHandoff = yield* store.append(
            { _tag: "Message", message: assistant("after handoff") },
            { commandId: "fixture-109" },
          )
          expect((yield* store.effectivePath()).map((entry) => entry.id)).toEqual([handoff.id, afterHandoff.id])
          expect(yield* store.latestCompaction()).toEqual(checkpoint)
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "retries an ambiguously committed stable append without duplication or sequence advance",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")
          const entry = { _tag: "Message" as const, message: user("committed once") }
          const options = { id: "logical:model:0:session-entry:0:user", expectedLeafId: null }
          const committed = yield* Deferred.make<void>()
          const append = store.append(entry, options).pipe(
            Effect.tap(() => Deferred.succeed(committed, undefined)),
            Effect.andThen(Effect.never),
          )
          const fiber = yield* Effect.forkChild(append, { startImmediately: true })

          yield* Deferred.await(committed)
          yield* Fiber.interrupt(fiber)
          const retried = yield* store.append(entry, options)
          const divergentPayload = yield* Effect.flip(
            store.append({ ...entry, message: user("different digest") }, options),
          )
          const divergentParent = yield* Effect.flip(
            store.append(entry, { ...options, expectedLeafId: "different-parent" }),
          )

          expect(retried.id).toBe(options.id)
          expect(divergentPayload._tag).toBe("generalist/core/SessionConflict")
          expect(divergentParent._tag).toBe("generalist/core/SessionConflict")
          if (divergentPayload._tag === "generalist/core/SessionConflict") {
            expect(divergentPayload.reason).toBe("entry-id-reused")
          }
          if (divergentParent._tag === "generalist/core/SessionConflict") {
            expect(divergentParent.reason).toBe("entry-id-reused")
          }
          expect((yield* store.path()).filter((candidate) => candidate.id === options.id)).toHaveLength(1)

          const next = yield* store.append({ _tag: "Message", message: user("next") }, { commandId: "fixture-154" })
          expect(next.id).toBe("1")
          expect((yield* store.append(entry, options)).id).toBe(options.id)
          expect((yield* store.path()).filter((candidate) => candidate.id === options.id)).toHaveLength(1)
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "rejects an exact stable append retry after its branch is abandoned",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")
          const entry = { _tag: "Message" as const, message: user("old branch") }
          const options = { id: "logical:model:0:session-entry:0:user", expectedLeafId: null }
          yield* store.append(entry, options)
          yield* store.setLeaf(null, "fixture-173")
          yield* store.append(
            { _tag: "Message", message: user("new branch") },
            { id: "logical:model:1:session-entry:0:user", expectedLeafId: null },
          )

          const stale = yield* Effect.flip(store.append(entry, options))

          expect(stale._tag).toBe("generalist/core/SessionConflict")
          if (stale._tag === "generalist/core/SessionConflict") expect(stale.reason).toBe("stale-leaf")
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "moves the leaf pointer to fork a branch",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")

          const first = yield* store.append({ _tag: "Message", message: user("A") }, { commandId: "fixture-196" })
          const abandoned = yield* store.append({ _tag: "Message", message: user("B") }, { commandId: "fixture-197" })
          yield* store.setLeaf(first.id, "fixture-198")
          const fork = yield* store.append({ _tag: "Message", message: assistant("C") }, { commandId: "fixture-199" })

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
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")

          const first = yield* store.append({ _tag: "Message", message: user("m1") }, { commandId: "fixture-218" })
          const second = yield* store.append({ _tag: "Message", message: user("m2") }, { commandId: "fixture-219" })
          const third = yield* store.append({ _tag: "Message", message: user("m3") }, { commandId: "fixture-220" })
          const id = yield* store.reserveEntryId("summary-checkpoint")
          const { checkpoint } = yield* store.appendCheckpoint({
            id,
            parentId: third.id,
            projectedHistory: Prompt.fromMessages([user("summary m1-m3"), user("m3")]),
            telemetry: [],
            summary: "summary m1-m3",
          })
          const fourth = yield* store.append({ _tag: "Message", message: user("m4") }, { commandId: "fixture-229" })
          const path = yield* store.path()

          expect(path).toEqual([first, second, third, checkpoint, fourth])
          expect(promptTexts(Session.buildContext(path))).toEqual(["summary m1-m3", "m3", "m4"])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "projects lossless memory context across compaction without recalled or synthetic entries",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")

          const first = yield* store.append(
            { _tag: "Message", message: user("authored before") },
            { commandId: "fixture-247" },
          )
          yield* store.append(
            {
              _tag: "Message",
              message: Memory.messageFromRecall([Prompt.makePart("text", { text: "recalled" })]),
            },
            { commandId: "fixture-248" },
          )
          const kept = yield* store.append(
            { _tag: "Message", message: assistant("model before") },
            { commandId: "fixture-252" },
          )
          const id = yield* store.reserveEntryId("memory-checkpoint")
          yield* store.appendCheckpoint({
            id,
            parentId: kept.id,
            projectedHistory: Prompt.fromMessages([user("summary containing recalled and authored context")]),
            telemetry: [],
            summary: "summary containing recalled and authored context",
          })
          yield* store.append({ _tag: "Message", message: user("authored after") }, { commandId: "fixture-261" })
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
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")

          yield* store.append({ _tag: "Message", message: user("m1") }, { commandId: "fixture-218" })
          const second = yield* store.append({ _tag: "Message", message: user("m2") }, { commandId: "fixture-219" })
          const oldId = yield* store.reserveEntryId("old-checkpoint")
          const old = yield* store.appendCheckpoint({
            id: oldId,
            parentId: second.id,
            projectedHistory: Prompt.fromMessages([user("old summary")]),
            telemetry: [],
            summary: "old summary",
          })
          const third = yield* store.append({ _tag: "Message", message: user("m3") }, { commandId: "fixture-220" })
          const newId = yield* store.reserveEntryId("new-checkpoint")
          yield* store.appendCheckpoint({
            id: newId,
            parentId: third.id,
            projectedHistory: Prompt.fromMessages([user("new summary")]),
            telemetry: [],
            summary: "new summary",
          })
          yield* store.append({ _tag: "Message", message: user("m4") }, { commandId: "fixture-229" })

          expect(old.checkpoint.id).toBe(oldId)
          expect(promptTexts(Session.buildContext(yield* store.path()))).toEqual(["new summary", "m4"])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "renders branch summaries as system notes",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")

          yield* store.append({ _tag: "Message", message: user("main") }, { commandId: "fixture-319" })
          yield* store.append(
            { _tag: "BranchSummary", summary: "alternate branch tried X" },
            { commandId: "fixture-320" },
          )
          yield* store.append({ _tag: "Message", message: assistant("continue") }, { commandId: "fixture-321" })

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
    "projects memory, skills, steering, tool calls, and tool results as prompt context",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")
          const toolCall = Prompt.makePart("tool-call", {
            id: "call-search",
            name: "web_search",
            params: { query: "Generalist" },
            providerExecuted: false,
          })
          const toolResult = Prompt.makePart("tool-result", {
            id: "call-search",
            name: "web_search",
            isFailure: false,
            providerExecuted: false,
            result: { results: ["Generalist docs"] },
          })

          yield* store.append({ _tag: "Memory", items: ["customer is enterprise"] }, { commandId: "fixture-354" })
          yield* store.append(
            { _tag: "Skill", name: "research", body: "Use primary sources." },
            { commandId: "fixture-355" },
          )
          yield* store.append({ _tag: "Steering", message: user("Prioritize docs.") }, { commandId: "fixture-356" })
          yield* store.append({ _tag: "ToolCall", part: toolCall }, { commandId: "fixture-357" })
          yield* store.append({ _tag: "ToolResult", part: toolResult }, { commandId: "fixture-358" })
          const path = yield* store.path()

          const prompt = Session.buildContext(path)

          expect(prompt.content.map((message) => message.role)).toEqual([
            "system",
            "system",
            "user",
            "assistant",
            "tool",
          ])
          expect(promptTexts(prompt)).toEqual([
            "<memory>\ncustomer is enterprise\n</memory>",
            '<skill name="research">\nUse primary sources.\n</skill>',
            "Prioritize docs.",
            "",
            "",
          ])
          expect(prompt.content[3]?.content).toEqual([toolCall])
          expect(prompt.content[4]?.content).toEqual([toolResult])
        }),
      ] as const,
  )

  it.effect("rejects unresolved tool calls before model context reuse", () =>
    Effect.gen(function* () {
      const call = Prompt.makePart("tool-call", {
        id: "call-child",
        name: "run_child",
        params: { prompt: "inspect" },
        providerExecuted: false,
      })
      const prompt = Prompt.fromMessages([Prompt.makeMessage("assistant", { content: [call] })])
      const invalid = yield* Effect.flip(Session.validateContext(prompt))
      expect(invalid.issues).toEqual([{ toolCallId: "call-child", reason: "unresolved" }])
      expect(Session.unresolvedToolCalls(prompt)).toEqual([call])
    }),
  )

  it.effect("rejects duplicate and mismatched framework tool outcomes", () =>
    Effect.gen(function* () {
      const call = Prompt.makePart("tool-call", {
        id: "call-child",
        name: "run_child",
        params: { prompt: "inspect" },
        providerExecuted: false,
      })
      const mismatched = Prompt.makePart("tool-result", {
        id: call.id,
        name: "other_tool",
        isFailure: false,
        providerExecuted: false,
        result: "wrong",
      })
      const result = Prompt.makePart("tool-result", {
        id: call.id,
        name: call.name,
        isFailure: false,
        providerExecuted: false,
        result: "done",
      })
      const prompt = Prompt.fromMessages([
        Prompt.makeMessage("assistant", { content: [call] }),
        Prompt.makeMessage("tool", { content: [mismatched, result, result] }),
      ])

      const invalid = yield* Effect.flip(Session.validateContext(prompt))
      expect(invalid.issues).toEqual([
        { toolCallId: call.id, reason: "name-mismatch" },
        { toolCallId: call.id, reason: "duplicate-result" },
      ])
    }),
  )

  it.effect("allows a completed framework tool call id to be reused in a later exchange", () =>
    Effect.gen(function* () {
      const call = Prompt.makePart("tool-call", {
        id: "reused-call",
        name: "run_child",
        params: { prompt: "inspect" },
        providerExecuted: false,
      })
      const result = Prompt.makePart("tool-result", {
        id: call.id,
        name: call.name,
        isFailure: false,
        providerExecuted: false,
        result: "done",
      })
      const prompt = Prompt.fromMessages([
        Prompt.makeMessage("assistant", { content: [call] }),
        Prompt.makeMessage("tool", { content: [result] }),
        Prompt.makeMessage("assistant", { content: [call] }),
        Prompt.makeMessage("tool", { content: [result] }),
      ])

      yield* Session.validateContext(prompt)
      expect(Session.unresolvedToolCalls(prompt)).toEqual([])
    }),
  )

  ItLayer.make(
    it,
    "treats the latest handoff or compaction as a self-contained conversation boundary",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")
          const source = yield* store.append(
            { _tag: "Message", message: user("source sentinel") },
            { commandId: "fixture-468" },
          )
          const checkpointId = yield* store.reserveEntryId("handoff-checkpoint")
          yield* store.appendCheckpoint({
            id: checkpointId,
            parentId: source.id,
            projectedHistory: Prompt.fromMessages([user("compacted")]),
            telemetry: [],
          })
          const between = yield* store.append(
            { _tag: "Message", message: assistant("between") },
            { commandId: "fixture-476" },
          )
          yield* store.append(
            {
              _tag: "Handoff",
              handoffId: "handoff-1",
              target: "specialist",
              projectedHistory: Prompt.fromMessages([user("projected-for-specialist")]),
            },
            { id: "handoff-entry-1", expectedLeafId: between.id },
          )
          yield* store.append({ _tag: "Message", message: assistant("after") }, { commandId: "fixture-486" })
          const path = yield* store.path()

          expect(promptTexts(Session.buildContext(path))).toEqual(["projected-for-specialist", "after"])
          expect(promptTexts(Session.buildMemoryContext(path))).toEqual(["source sentinel", "between", "after"])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "imports exact handoff projections idempotently and rejects divergent or inactive reuse",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")
          const source = yield* store.append({ _tag: "Message", message: user("source") }, { commandId: "fixture-503" })
          const handoff = {
            _tag: "Handoff" as const,
            handoffId: "handoff-exact",
            target: "specialist",
            projectedHistory: Prompt.fromMessages([user("exact projection")]),
          }
          const appended = yield* store.append(handoff, { id: "handoff-entry", expectedLeafId: source.id })
          yield* store.append({ _tag: "Message", message: assistant("descendant") }, { commandId: "fixture-511" })
          const repeated = yield* store.append(handoff, { id: "handoff-entry", expectedLeafId: source.id })
          const divergent = yield* Effect.flip(
            store.append(
              { ...handoff, projectedHistory: Prompt.fromMessages([user("different")]) },
              { id: "handoff-entry", expectedLeafId: source.id },
            ),
          )
          expect(repeated).toEqual(appended)
          expect(divergent).toMatchObject({ reason: "entry-id-reused" })
          expect(promptTexts(Session.buildContext(yield* store.path()))).toEqual(["exact projection", "descendant"])

          yield* store.setLeaf(source.id, "fixture-523")
          const inactive = yield* Effect.flip(store.append(handoff, { id: "handoff-entry", expectedLeafId: source.id }))
          expect(inactive).toMatchObject({ reason: "stale-leaf" })
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "fails typed for unknown leaves",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")

          const setLeafFailure = yield* Effect.flip(store.setLeaf("missing", "fixture-539"))
          const pathFailure = yield* Effect.flip(store.path("missing"))

          expect(setLeafFailure._tag).toBe("generalist/core/SessionStoreError")
          expect(pathFailure._tag).toBe("generalist/core/SessionStoreError")
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "appends exact checkpoints idempotently and rejects identity or leaf conflicts",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")
          const source = yield* store.append({ _tag: "Message", message: user("source") }, { commandId: "fixture-503" })
          const id = yield* store.reserveEntryId("exact-checkpoint")
          const prepared: Session.PreparedCheckpoint = {
            id,
            parentId: source.id,
            projectedHistory: Prompt.fromMessages([user("exact projection")]),
            telemetry: [],
          }

          const appended = yield* store.appendCheckpoint(prepared)
          const repeated = yield* store.appendCheckpoint(prepared)
          const reused = yield* Effect.flip(
            store.appendCheckpoint({ ...prepared, projectedHistory: Prompt.fromMessages([user("different")]) }),
          )
          const staleId = yield* store.reserveEntryId("stale-checkpoint")
          const stale = yield* Effect.flip(
            store.appendCheckpoint({
              id: staleId,
              parentId: source.id,
              projectedHistory: Prompt.fromMessages([user("stale")]),
              telemetry: [],
            }),
          )

          expect(appended._tag).toBe("Appended")
          expect(repeated._tag).toBe("AlreadyPresent")
          expect(reused._tag).toBe("generalist/core/SessionConflict")
          expect(stale._tag).toBe("generalist/core/SessionConflict")
          if (reused._tag === "generalist/core/SessionConflict") expect(reused.reason).toBe("checkpoint-id-reused")
          if (stale._tag === "generalist/core/SessionConflict") expect(stale.reason).toBe("stale-leaf")
          expect((yield* store.path()).filter((entry) => entry._tag === "Compaction")).toHaveLength(1)
          expect(promptTexts(Session.buildContext(yield* store.path()))).toEqual(["exact projection"])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "persists durable telemetry delivery identity and rejects every changed checkpoint identity field",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")
          const source = yield* store.append({ _tag: "Message", message: user("source") }, { commandId: "fixture-503" })
          const id = yield* store.reserveEntryId("telemetry-checkpoint")
          const telemetry: ReadonlyArray<ModelTelemetry.Event> = [
            {
              _tag: "ModelCallStarted",
              deliveryId: "delivery-0",
              turn: 1,
              modelCallId: "summary-call",
              purpose: "compaction-summary",
              compactionId: "compaction-1",
              startedAt: 10,
            },
            {
              _tag: "ModelCallCompleted",
              deliveryId: "delivery-1",
              turn: 1,
              modelCallId: "summary-call",
              purpose: "compaction-summary",
              attempts: 1,
              completedAt: 20,
            },
          ]
          const compactionCommit: ModelTelemetry.CompactionCommit = {
            compactionId: "compaction-1",
            checkpointId: id,
            summaryModelCallId: "summary-call",
            contextTokensBefore: 100,
            contextTokensAfter: 40,
            entriesBefore: 8,
            entriesAfter: 3,
          }
          const prepared: Session.PreparedCheckpoint = {
            id,
            parentId: source.id,
            projectedHistory: Prompt.fromMessages([user("durable")]),
            telemetry,
            compactionCommit,
          }

          const appended = yield* store.appendCheckpoint(prepared)
          const replayed = yield* store.appendCheckpoint(prepared)
          expect(appended.checkpoint.telemetry).toEqual(telemetry)
          expect(appended.checkpoint.compactionCommit).toEqual(compactionCommit)
          expect(replayed._tag).toBe("AlreadyPresent")

          const changed: ReadonlyArray<Session.PreparedCheckpoint> = [
            { ...prepared, telemetry: [{ ...telemetry[0]!, deliveryId: "changed" }, telemetry[1]!] },
            { ...prepared, telemetry: [telemetry[1]!, telemetry[0]!] },
            {
              ...prepared,
              telemetry: [
                telemetry[0]!,
                {
                  _tag: "ModelCallCompleted",
                  deliveryId: "delivery-1",
                  turn: 1,
                  modelCallId: "summary-call",
                  purpose: "compaction-summary",
                  attempts: 1,
                  completedAt: 21,
                },
              ],
            },
            { ...prepared, compactionCommit: { ...compactionCommit, summaryModelCallId: "other-call" } },
            { ...prepared, compactionCommit: { ...compactionCommit, contextTokensBefore: 101 } },
            { ...prepared, compactionCommit: { ...compactionCommit, contextTokensAfter: 41 } },
            { ...prepared, compactionCommit: { ...compactionCommit, entriesBefore: 9 } },
            { ...prepared, compactionCommit: { ...compactionCommit, entriesAfter: 4 } },
            { ...prepared, compactionCommit: { ...compactionCommit, checkpointId: "wrong-checkpoint" } },
          ]
          for (const candidate of changed) {
            const failure = yield* Effect.flip(store.appendCheckpoint(candidate))
            expect(failure._tag).toBe("generalist/core/SessionConflict")
            if (failure._tag === "generalist/core/SessionConflict") {
              expect(failure.reason).toBe("checkpoint-id-reused")
            }
          }
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "retries an ambiguously interrupted checkpoint append without duplication",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")
          const source = yield* store.append({ _tag: "Message", message: user("source") }, { commandId: "fixture-503" })
          const prepared: Session.PreparedCheckpoint = {
            id: yield* store.reserveEntryId("interrupted-checkpoint"),
            parentId: source.id,
            projectedHistory: Prompt.fromMessages([user("committed projection")]),
            telemetry: [],
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
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")
          const source = yield* store.append({ _tag: "Message", message: user("source") }, { commandId: "fixture-503" })
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
            id: yield* store.reserveEntryId("structural-checkpoint"),
            parentId: source.id,
            projectedHistory: toolProjection({ first: 1, second: 2 }),
            telemetry: [],
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
        layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.acquire("test")
          const source = yield* store.append({ _tag: "Message", message: user("source") }, { commandId: "fixture-503" })
          const prepared: Session.PreparedCheckpoint = {
            id: yield* store.reserveEntryId("abandoned-checkpoint"),
            parentId: source.id,
            projectedHistory: Prompt.fromMessages([user("checkpoint")]),
            telemetry: [],
          }
          yield* store.appendCheckpoint(prepared)
          const descendant = yield* store.append(
            { _tag: "Message", message: user("descendant") },
            { commandId: "fixture-770", expectedLeafId: prepared.id },
          )

          const delayed = yield* store.appendCheckpoint(prepared)

          expect(delayed._tag).toBe("AlreadyPresent")
          expect(delayed.leafId).toBe(descendant.id)
          expect(promptTexts(Session.buildContext(yield* store.path(delayed.leafId)))).toEqual([
            "checkpoint",
            "descendant",
          ])

          yield* store.setLeaf(source.id, "fixture-523")
          yield* store.append(
            { _tag: "Message", message: user("other branch") },
            { commandId: "fixture-785", expectedLeafId: source.id },
          )
          const abandoned = yield* Effect.flip(store.appendCheckpoint(prepared))

          expect(abandoned._tag).toBe("generalist/core/SessionConflict")
          if (abandoned._tag === "generalist/core/SessionConflict") {
            expect(abandoned.reason).toBe("checkpoint-not-on-active-path")
          }
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "keeps keyed stores isolated across IDs and alive across Run scopes",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const aliceFirst = yield* Effect.scoped(
            Effect.gen(function* () {
              const store = yield* Session.acquire("alice")
              return yield* store.append({ _tag: "Message", message: user("alice only") }, { commandId: "fixture-806" })
            }),
          )
          const bobFirst = yield* Effect.scoped(
            Effect.gen(function* () {
              const store = yield* Session.acquire("bob")
              return yield* store.append({ _tag: "Message", message: user("bob only") }, { commandId: "fixture-812" })
            }),
          )
          const alicePath = yield* Effect.scoped(Session.acquire("alice").pipe(Effect.flatMap((store) => store.path())))
          const bobPath = yield* Effect.scoped(Session.acquire("bob").pipe(Effect.flatMap((store) => store.path())))

          expect(aliceFirst.id).toBe("0")
          expect(bobFirst.id).toBe("0")
          expect(promptTexts(Session.buildContext(alicePath))).toEqual(["alice only"])
          expect(promptTexts(Session.buildContext(bobPath))).toEqual(["bob only"])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "queues one ID independently and releases its lane on cancellation",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const active = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const sameAcquired = yield* Deferred.make<void>()
          const otherAcquired = yield* Deferred.make<void>()
          const first = yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Session.acquire("shared")
              yield* Deferred.succeed(active, undefined)
              yield* Deferred.await(release)
            }),
          ).pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(active)
          const waiting = yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Session.acquire("shared")
              yield* Deferred.succeed(sameAcquired, undefined)
            }),
          ).pipe(Effect.forkChild({ startImmediately: true }))
          const other = yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Session.acquire("other")
              yield* Deferred.succeed(otherAcquired, undefined)
            }),
          ).pipe(Effect.forkChild({ startImmediately: true }))

          yield* Deferred.await(otherAcquired)
          expect(Option.isNone(yield* Deferred.poll(sameAcquired))).toBe(true)
          yield* Fiber.interrupt(waiting)
          yield* Deferred.succeed(release, undefined)
          yield* Fiber.join(first)
          yield* Fiber.join(other)

          yield* Effect.scoped(Session.acquire("shared"))
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "releases an active Session lane when its Scope is interrupted",
    () =>
      [
        layerMemory,
        Effect.gen(function* () {
          const acquired = yield* Deferred.make<void>()
          const active = yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Session.acquire("interrupted")
              yield* Deferred.succeed(acquired, undefined)
              return yield* Effect.never
            }),
          ).pipe(Effect.forkChild({ startImmediately: true }))

          yield* Deferred.await(acquired)
          yield* Fiber.interrupt(active)
          yield* Effect.scoped(Session.acquire("interrupted"))
        }),
      ] as const,
  )
})
