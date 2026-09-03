import { expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { EmbeddingModel, LanguageModel, Prompt, Response, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Memory, Permissions } from "../../src/index.js"
import { SemanticRecall, VectorStore } from "../../src/memory/index.js"
import { ExecutableResolver, Run, RunExecutor, RunStore, Runtime } from "../../src/runtime/index.js"
import { TestModel } from "../../src/testing/index.js"
import {
  consolidate,
  layer as learningLayer,
  type ConsolidationApplyHandlers,
} from "../../src/unstable/learning/index.js"
import { provideScoped } from "../runtime/execution/scoped-provide.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})

const sourceModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.fromIterable<Response.StreamPartEncoded>([
        Response.makePart("text-delta", { id: "source", delta: "episode completed" }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      ]),
  }),
)

const embeddingLayer = Layer.effect(
  EmbeddingModel.EmbeddingModel,
  EmbeddingModel.make({
    embedMany: ({ inputs }) => Effect.succeed({ results: inputs.map(() => [1]), usage: { inputTokens: undefined } }),
  }),
)

const semanticMemory = SemanticRecall.layer({ limit: 20 }).pipe(
  Layer.provideMerge(VectorStore.layerMemory),
  Layer.provideMerge(embeddingLayer),
)

const runtimeLayer = Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
)

const learningKey: Memory.Key = { agent: "learning", subject: "learning" }
const sourceAgent = Agent.make({ name: "consolidation-source", toolkit: Toolkit.empty })

const transcript = (user: string, assistant: string) =>
  Prompt.fromMessages([
    Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: user })] }),
    Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text: assistant })] }),
  ])

const activeAgent = (run: Run.RunInspection): string | undefined => {
  const entry = run.executableManifest.entries.find((candidate) => candidate.pin === run.executableRef.active)
  return entry?._tag === "Agent" ? entry.manifest.name : undefined
}

const execute = (
  executor: RunExecutor.Service,
  store: RunStore.Service,
  runId: Memory.OperationRef["runId"],
  ownerId: string,
) => Effect.flatMap(store.claimExecution({ runId, ownerId }), executor.execute)

const handlers = (
  memory: Memory.Service,
  onApply: () => void = () => undefined,
): ConsolidationApplyHandlers<never, Memory.MemoryError> => ({
  RefineInstruction: () => Effect.sync(onApply),
  Remember: (proposal) =>
    memory.remember({ ...proposal.memory, evidence: proposal.evidence }).pipe(Effect.tap(() => Effect.sync(onApply))),
  Forget: (proposal) => memory.forget(proposal.memory).pipe(Effect.tap(() => Effect.sync(onApply))),
})

it.effect("consolidates contradictory episodes into an evidenced version and can revert it", () =>
  provideScoped(
    runtimeLayer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      const memoryContext = yield* Layer.build(semanticMemory)
      const memory = Context.get(memoryContext, Memory.Memory)
      const memoryLayer = Layer.succeed(Memory.Memory, memory)
      const existingEvidence = [{ runId: "run:existing-memory" as const, turn: 0 }]
      yield* memory.remember({
        key: learningKey,
        turn: 0,
        transcript: transcript("Preferred color?", "The preferred color is blue."),
        terminal: true,
        evidence: existingEvidence,
      })
      const [existing] = yield* memory.recall({ key: learningKey, turn: 0, prompt: Prompt.make("preferred color") })
      if (existing === undefined) return yield* Effect.die("missing initial semantic memory")

      const sourceContext = yield* Layer.build(
        Layer.mergeAll(sourceModel, Permissions.layerAllowAll, Approvals.layerAutoApprove),
      )
      yield* runtime.register(sourceAgent).pipe(Effect.provideContext(sourceContext))
      const sourceRuns: Array<Memory.OperationRef["runId"]> = []
      for (const index of [1, 2, 3]) {
        const handle = yield* runtime.start(sourceAgent, `Episode ${index}: the preferred color is green.`, {
          idempotencyKey: `consolidation-source-${index}`,
          sessionId: `consolidation-source-${index}`,
        })
        sourceRuns.push(handle.runId)
        yield* execute(executor, store, handle.runId, `source-${index}`)
        expect(yield* handle.await).toBe("episode completed")
      }

      const episodeEvidence = sourceRuns.map((runId) => ({ runId, turn: 0 }))
      const fixture = yield* TestModel.make(
        [
          TestModel.text("The episodes consistently contradict the old memory."),
          TestModel.object({
            output: {
              proposals: [
                { _tag: "Forget", memory: { key: learningKey, id: existing.id }, evidence: episodeEvidence },
                {
                  _tag: "Remember",
                  memory: {
                    key: learningKey,
                    turn: 0,
                    transcript: transcript("Preferred color?", "The preferred color is green."),
                    terminal: true,
                    entryId: existing.id,
                    supersedes: 1,
                  },
                  evidence: [],
                },
              ],
            },
          }),
        ],
        { model: "consolidation" },
      )
      const approvals: Array<Approvals.Pending> = []
      const approvalLayer = Approvals.layerTest({
        resolve: (pending) =>
          Effect.sync(() => {
            approvals.push(pending)
            return Approvals.Approved()
          }),
      })
      let applied = 0
      const proposer = consolidate({
        schedule: "FREQ=DAILY;BYHOUR=3",
        window: "24 hours",
        model: "consolidation",
        maxProposals: 20,
        budget: { tokens: 100 },
      })
      const dependencies = Layer.mergeAll(
        Layer.succeed(Runtime.Runtime, runtime),
        memoryLayer,
        fixture.registryLayer,
        approvalLayer,
      )
      const context = yield* Layer.build(
        Layer.mergeAll(
          dependencies,
          Permissions.layerAllowAll,
          learningLayer({
            propose: proposer,
            apply: handlers(memory, () => {
              applied += 1
            }),
          }).pipe(Layer.provide(dependencies)),
        ),
      )

      yield* TestClock.adjust("3 hours")
      const scheduled = (yield* runtime.list({ limit: 20 })).find(
        (run) => activeAgent(run) === "generalist-learning-consolidation",
      )
      if (scheduled === undefined) return yield* Effect.die("missing scheduled consolidation run")
      yield* execute(executor, store, scheduled.runId, "consolidation").pipe(Effect.provideContext(context))

      const outcome = (yield* runtime.snapshot(scheduled.runId)).outcome
      expect(outcome).toMatchObject({ _tag: "Succeeded" })
      const history = yield* memory.history(existing.id)
      expect(history).toMatchObject([
        { version: 1, evidence: existingEvidence },
        { version: 2, supersedes: 1, evidence: [...existingEvidence, ...episodeEvidence] },
      ])
      expect(history[1]?.text).toContain("preferred color is green")
      expect(applied).toBe(2)
      expect(approvals).toHaveLength(2)
      expect(approvals.every((pending) => pending.level === "ask" && pending.call.name === "learning")).toBe(true)
      const prompts = yield* fixture.prompts
      const encodedPrompt = yield* Schema.encodeEffect(Schema.fromJsonString(Prompt.Prompt))(prompts[0] ?? Prompt.empty)
      expect(encodedPrompt).toContain(existing.id)
      for (const runId of sourceRuns) expect(encodedPrompt).toContain(runId)

      yield* memory.revert(existing.id, { to: 1 })
      const restored = yield* memory.recall({ key: learningKey, turn: 0, prompt: Prompt.make("preferred color") })
      expect(restored[0]?.content).toEqual([
        Prompt.makePart("text", { text: "User: Preferred color?\nAssistant: The preferred color is blue." }),
      ])
      expect(yield* memory.history(existing.id)).toHaveLength(2)
    }),
  ),
)

it.effect("runs once per UTC day with its own budget", () =>
  provideScoped(
    runtimeLayer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      const memoryContext = yield* Layer.build(semanticMemory)
      const memory = Context.get(memoryContext, Memory.Memory)
      const fixture = yield* TestModel.make([TestModel.text("must not run")], { model: "budgeted-consolidation" })
      const dependencies = Layer.mergeAll(
        Layer.succeed(Runtime.Runtime, runtime),
        Layer.succeed(Memory.Memory, memory),
        fixture.registryLayer,
        Approvals.layerAutoApprove,
      )
      const context = yield* Layer.build(
        Layer.mergeAll(
          dependencies,
          Permissions.layerAllowAll,
          learningLayer({
            propose: consolidate({
              schedule: "FREQ=DAILY;BYHOUR=3",
              window: "24 hours",
              model: "budgeted-consolidation",
              maxProposals: 1,
              budget: { tokens: 0 },
            }),
            apply: handlers(memory),
          }).pipe(Layer.provide(dependencies)),
        ),
      )

      yield* TestClock.adjust("179 minutes")
      expect(yield* runtime.list({ limit: 10 })).toHaveLength(0)
      yield* TestClock.adjust("1 minute")
      const [first] = yield* runtime.list({ limit: 10 })
      if (first === undefined) return yield* Effect.die("missing first consolidation occurrence")
      yield* execute(executor, store, first.runId, "budgeted-consolidation").pipe(Effect.provideContext(context))
      expect(yield* runtime.inspect(first.runId)).toMatchObject({
        status: "waiting",
        budget: { tokens: 0 },
        suspension: { _tag: "BudgetExhausted", budget: "tokens" },
      })
      expect(yield* fixture.requests).toHaveLength(0)

      yield* TestClock.adjust("1439 minutes")
      expect(yield* runtime.list({ limit: 10 })).toHaveLength(1)
      yield* TestClock.adjust("1 minute")
      expect(yield* runtime.list({ limit: 10 })).toHaveLength(2)
    }),
  ),
)
