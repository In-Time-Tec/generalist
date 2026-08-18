import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Memory, ModelTelemetry, Session } from "../../src/core/index"
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
    const excluded: Extract<Session.AppendInput, { readonly _tag: "Compaction" }> extends never ? true : false = true
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
    "retries an ambiguously committed stable append without duplication or sequence advance",
    () =>
      [
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
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
          expect(divergentPayload._tag).toBe("tenetkit/core/SessionConflict")
          expect(divergentParent._tag).toBe("tenetkit/core/SessionConflict")
          if (divergentPayload._tag === "tenetkit/core/SessionConflict") {
            expect(divergentPayload.reason).toBe("entry-id-reused")
          }
          if (divergentParent._tag === "tenetkit/core/SessionConflict") {
            expect(divergentParent.reason).toBe("entry-id-reused")
          }
          expect((yield* store.path()).filter((candidate) => candidate.id === options.id)).toHaveLength(1)

          const next = yield* store.append({ _tag: "Message", message: user("next") })
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
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const entry = { _tag: "Message" as const, message: user("old branch") }
          const options = { id: "logical:model:0:session-entry:0:user", expectedLeafId: null }
          yield* store.append(entry, options)
          yield* store.setLeaf(null)
          yield* store.append(
            { _tag: "Message", message: user("new branch") },
            { id: "logical:model:1:session-entry:0:user", expectedLeafId: null },
          )

          const stale = yield* Effect.flip(store.append(entry, options))

          expect(stale._tag).toBe("tenetkit/core/SessionConflict")
          if (stale._tag === "tenetkit/core/SessionConflict") expect(stale.reason).toBe("stale-leaf")
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
          const id = yield* store.reserveEntryId
          const { checkpoint } = yield* store.appendCheckpoint({
            id,
            parentId: third.id,
            projectedHistory: Prompt.fromMessages([user("summary m1-m3"), user("m3")]),
            telemetry: [],
            summary: "summary m1-m3",
          })
          const fourth = yield* store.append({ _tag: "Message", message: user("m4") })
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
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore

          const first = yield* store.append({ _tag: "Message", message: user("authored before") })
          yield* store.append({
            _tag: "Message",
            message: Memory.messageFromRecall([Prompt.makePart("text", { text: "recalled" })]),
          })
          const kept = yield* store.append({ _tag: "Message", message: assistant("model before") })
          const id = yield* store.reserveEntryId
          yield* store.appendCheckpoint({
            id,
            parentId: kept.id,
            projectedHistory: Prompt.fromMessages([user("summary containing recalled and authored context")]),
            telemetry: [],
            summary: "summary containing recalled and authored context",
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
          const oldId = yield* store.reserveEntryId
          const old = yield* store.appendCheckpoint({
            id: oldId,
            parentId: second.id,
            projectedHistory: Prompt.fromMessages([user("old summary")]),
            telemetry: [],
            summary: "old summary",
          })
          const third = yield* store.append({ _tag: "Message", message: user("m3") })
          const newId = yield* store.reserveEntryId
          yield* store.appendCheckpoint({
            id: newId,
            parentId: third.id,
            projectedHistory: Prompt.fromMessages([user("new summary")]),
            telemetry: [],
            summary: "new summary",
          })
          yield* store.append({ _tag: "Message", message: user("m4") })

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
    "projects memory, skills, steering, tool calls, and tool results as prompt context",
    () =>
      [
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const toolCall = Prompt.makePart("tool-call", {
            id: "call-search",
            name: "web_search",
            params: { query: "TenetKit" },
            providerExecuted: false,
          })
          const toolResult = Prompt.makePart("tool-result", {
            id: "call-search",
            name: "web_search",
            isFailure: false,
            result: { results: ["TenetKit docs"] },
          })

          yield* store.append({ _tag: "Memory", items: ["customer is enterprise"] })
          yield* store.append({ _tag: "Skill", name: "research", body: "Use primary sources." })
          yield* store.append({ _tag: "Steering", message: user("Prioritize docs.") })
          yield* store.append({ _tag: "ToolCall", part: toolCall })
          yield* store.append({ _tag: "ToolResult", part: toolResult })
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
        result: "wrong",
      })
      const result = Prompt.makePart("tool-result", {
        id: call.id,
        name: call.name,
        isFailure: false,
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
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const source = yield* store.append({ _tag: "Message", message: user("source sentinel") })
          const checkpointId = yield* store.reserveEntryId
          yield* store.appendCheckpoint({
            id: checkpointId,
            parentId: source.id,
            projectedHistory: Prompt.fromMessages([user("compacted")]),
            telemetry: [],
          })
          const between = yield* store.append({ _tag: "Message", message: assistant("between") })
          yield* store.append(
            {
              _tag: "Handoff",
              handoffId: "handoff-1",
              target: "specialist",
              projectedHistory: Prompt.fromMessages([user("projected-for-specialist")]),
            },
            { id: "handoff-entry-1", expectedLeafId: between.id },
          )
          yield* store.append({ _tag: "Message", message: assistant("after") })
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
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const source = yield* store.append({ _tag: "Message", message: user("source") })
          const handoff = {
            _tag: "Handoff" as const,
            handoffId: "handoff-exact",
            target: "specialist",
            projectedHistory: Prompt.fromMessages([user("exact projection")]),
          }
          const appended = yield* store.append(handoff, { id: "handoff-entry", expectedLeafId: source.id })
          yield* store.append({ _tag: "Message", message: assistant("descendant") })
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

          yield* store.setLeaf(source.id)
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
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore

          const setLeafFailure = yield* Effect.flip(store.setLeaf("missing"))
          const pathFailure = yield* Effect.flip(store.path("missing"))

          expect(setLeafFailure._tag).toBe("tenetkit/core/SessionStoreError")
          expect(pathFailure._tag).toBe("tenetkit/core/SessionStoreError")
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
            telemetry: [],
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
              telemetry: [],
            }),
          )

          expect(appended._tag).toBe("Appended")
          expect(repeated._tag).toBe("AlreadyPresent")
          expect(reused._tag).toBe("tenetkit/core/SessionConflict")
          expect(stale._tag).toBe("tenetkit/core/SessionConflict")
          if (reused._tag === "tenetkit/core/SessionConflict") expect(reused.reason).toBe("checkpoint-id-reused")
          if (stale._tag === "tenetkit/core/SessionConflict") expect(stale.reason).toBe("stale-leaf")
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
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const source = yield* store.append({ _tag: "Message", message: user("source") })
          const id = yield* store.reserveEntryId
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
            expect(failure._tag).toBe("tenetkit/core/SessionConflict")
            if (failure._tag === "tenetkit/core/SessionConflict") {
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
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const source = yield* store.append({ _tag: "Message", message: user("source") })
          const prepared: Session.PreparedCheckpoint = {
            id: yield* store.reserveEntryId,
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
        Session.layerMemory,
        Effect.gen(function* () {
          const store = yield* Session.SessionStore
          const source = yield* store.append({ _tag: "Message", message: user("source") })
          const prepared: Session.PreparedCheckpoint = {
            id: yield* store.reserveEntryId,
            parentId: source.id,
            projectedHistory: Prompt.fromMessages([user("checkpoint")]),
            telemetry: [],
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

          expect(abandoned._tag).toBe("tenetkit/core/SessionConflict")
          if (abandoned._tag === "tenetkit/core/SessionConflict") {
            expect(abandoned.reason).toBe("checkpoint-not-on-active-path")
          }
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "layerTest provides an exact implementation",
    () =>
      [
        Session.layerTest({
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
