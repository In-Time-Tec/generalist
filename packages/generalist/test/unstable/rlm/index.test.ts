import { expect, it } from "@effect/vitest"
import { Context, Effect, FileSystem, Layer, Option, Ref, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Toolkit } from "effect/unstable/ai"
import { Agent, Compaction, NestedOperation, RunBudget } from "generalist"
import { ExecutableResolver, RunExecutor, RunStore, Runtime } from "generalist/runtime"
import { make, SandboxProvider, type SandboxService, Unsupported } from "generalist/sandbox"
import { TestModel } from "generalist/testing"
import { layer, rlmOffload } from "../../../src/unstable/rlm/index.js"
import { allowAllAuthorization } from "../../authorization.js"
import { provideScoped } from "../../runtime/execution/scoped-provide.js"

interface ProbeService {
  readonly files: Effect.Effect<ReadonlyMap<string, string>>
  readonly sources: Effect.Effect<ReadonlyArray<string>>
}

class Probe extends Context.Service<Probe, ProbeService>()("generalist/test/unstable/rlm/index.test/Probe") {}

const PromptJson = Schema.fromJsonString(Prompt.Prompt)
const ToolNames = Schema.Array(Schema.Struct({ name: Schema.String }))

const unsupported = (operation: Unsupported["operation"]) =>
  Effect.fail(Unsupported.make({ operation, message: `test sandbox does not support ${operation}` }))

const sandboxLayer = Layer.effectContext(
  Effect.gen(function* () {
    const stored = yield* Ref.make(new Map<string, string>())
    const sources = yield* Ref.make<ReadonlyArray<string>>([])
    const files = FileSystem.makeNoop({
      makeDirectory: () => Effect.void,
      readFileString: (path) => Ref.get(stored).pipe(Effect.map((current) => current.get(path) ?? "")),
      writeFileString: (path, data) =>
        Ref.update(stored, (current) => {
          const next = new Map(current)
          next.set(path, data)
          return next
        }),
    })
    const start: SandboxService["start"] = (command) => {
      if (command._tag !== "TypeScript") return unsupported("exec:typescript")
      const result = Ref.update(sources, (current) => [...current, command.source]).pipe(
        Effect.andThen(Ref.get(stored)),
        Effect.map((current) => ({
          stdout: "",
          stderr: "",
          exitCode: 0,
          value: { offloadedContext: current.get(".generalist/rlm/offloaded-context.json") ?? "[]" },
        })),
      )
      return Effect.succeed({ events: Stream.empty, result })
    }
    const sandbox = make({
      isolation: "process",
      limits: {},
      capabilities: {
        commands: ["TypeScript"],
        files: true,
        pause: false,
        resume: false,
        snapshot: false,
        fork: false,
        limits: [],
      },
      start,
      files: Effect.succeed(files),
      pause: unsupported("pause"),
      resume: unsupported("resume"),
      snapshot: unsupported("snapshot"),
      fork: () => unsupported("fork"),
    })
    const provider = SandboxProvider.of({ defaultImage: "test:rlm", acquire: () => Effect.succeed(sandbox) })
    return Context.make(SandboxProvider, provider).pipe(
      Context.add(Probe, Probe.of({ files: Ref.get(stored), sources: Ref.get(sources) })),
    )
  }),
)

const usage = (input: number, output: number): Response.Usage =>
  Response.Usage.make({
    inputTokens: { uncached: input, total: input, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: output, text: output, reasoning: undefined },
  })

const configuredRlmLayer = (
  root: TestModel.Fixture,
  leaf: TestModel.Fixture,
  options: { readonly maxDepth: number; readonly maxSubCalls: number },
) => layer({ root: root.layer, leaf: leaf.layer, ...options }).pipe(Layer.provideMerge(sandboxLayer))

it.effect("runs exec, journals llm_query, and returns the root answer", () =>
  Effect.gen(function* () {
    const root = yield* TestModel.make([
      TestModel.turn([TestModel.toolCall("exec", { code: "prompt.content.length" }, { id: "exec-1" })], {
        usage: usage(2, 1),
      }),
      TestModel.turn(
        [
          TestModel.toolCall(
            "llm_query",
            { prompt: "What number appears in the selected context?" },
            { id: "query-1" },
          ),
        ],
        { usage: usage(2, 1) },
      ),
      TestModel.turn([TestModel.text("The answer is 42.")], { usage: usage(2, 2) }),
    ])
    const leaf = yield* TestModel.make([
      TestModel.turn([TestModel.text("The selected context says 42.")], { usage: usage(3, 2) }),
    ])
    const nestedCalls = yield* Ref.make(0)
    const nested = NestedOperation.layerTest({
      run: (_request, effect) => Ref.update(nestedCalls, (count) => count + 1).pipe(Effect.andThen(effect)),
    })
    const services = Layer.mergeAll(
      allowAllAuthorization,
      nested,
      configuredRlmLayer(root, leaf, { maxDepth: 2, maxSubCalls: 4 }),
    )

    yield* provideScoped(
      services,
      Effect.gen(function* () {
        const agent = Agent.make({ name: "rlm-loop", toolkit: Toolkit.empty })
        const result = yield* Agent.run(agent, "DO_NOT_INTERPOLATE: find 42")
        const probe = yield* Probe
        const sources = yield* probe.sources
        const rootRequests = yield* root.requests
        const leafRequests = yield* leaf.requests

        expect(result).toBe("The answer is 42.")
        expect(yield* Ref.get(nestedCalls)).toBe(1)
        expect(rootRequests).toHaveLength(3)
        expect(leafRequests).toHaveLength(1)
        const toolNames = yield* Schema.decodeEffect(ToolNames)(rootRequests[0]?.tools ?? [])
        expect(toolNames.map((tool) => tool.name)).toEqual(["exec", "llm_query"])
        expect(rootRequests[0]?.tools.find((tool) => tool.name === "exec")?.parametersSchema.ast._tag).toBe("Objects")
        expect(yield* Schema.encodeEffect(PromptJson)(rootRequests[2]?.prompt ?? Prompt.empty)).toContain(
          "The selected context says 42",
        )
        expect(sources).toHaveLength(1)
        expect(sources[0]).toContain("var prompt = JSON.parse")
        expect(sources[0]).not.toContain("DO_NOT_INTERPOLATE")
        expect(Array.from((yield* probe.files).values()).join("\n")).toContain("DO_NOT_INTERPOLATE")
      }),
    )
  }),
)

it.effect("suspends a durable run when maxSubCalls is exhausted", () =>
  Effect.gen(function* () {
    const root = yield* TestModel.make([
      TestModel.toolCall("llm_query", { prompt: "one call too many" }, { id: "query-over-budget" }),
    ])
    const leaf = yield* TestModel.make([TestModel.text("must not run")])
    const model = configuredRlmLayer(root, leaf, { maxDepth: 1, maxSubCalls: 0 })
    const runtime = Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
    )
    const services = Layer.merge(runtime, Layer.mergeAll(allowAllAuthorization, model))

    yield* provideScoped(
      services,
      Effect.gen(function* () {
        const host = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const agent = Agent.make({ name: "rlm-budget", toolkit: Toolkit.empty })
        yield* host.register(agent)
        const handle = yield* host.start(agent, "run", { budget: RunBudget.make({}) })
        const claim = yield* store.claimExecution({ runId: handle.runId, ownerId: "rlm-budget-test" })
        yield* executor.execute(claim)

        expect(yield* host.inspect(handle.runId)).toMatchObject({
          status: "waiting",
          suspension: { _tag: "BudgetExhausted", budget: "toolCalls" },
        })
        expect((yield* host.operator.explain(handle.runId)).decision).toEqual({
          _tag: "AwaitBudget",
          budget: "toolCalls",
        })
        expect(yield* leaf.remaining).toBe(1)
      }),
    )
  }),
)

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const assistant = (text: string): Prompt.Message =>
  Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text })] })

it.effect("answers from context moved into the sandbox by rlmOffload", () =>
  Effect.gen(function* () {
    const root = yield* TestModel.make([
      TestModel.toolCall(
        "exec",
        { code: "offloadedContext.find((message) => JSON.stringify(message).includes('favorite programmer'))" },
        { id: "read-offload" },
      ),
      TestModel.text("The favorite programmer was Ada Lovelace."),
    ])
    const leaf = yield* TestModel.make([TestModel.text("unused")])
    const compact = Prompt.fromMessages([
      user("My favorite programmer is Ada Lovelace."),
      assistant("I will remember the favorite programmer."),
    ])
    const recent = Prompt.fromMessages([user("Who was my favorite programmer?")])
    const base: Compaction.Strategy = {
      shouldCompact: () => true,
      cut: () => Option.some({ keep: Prompt.empty, compact, recent }),
      summarize: () => Effect.die("rlmOffload must replace the base summarizer"),
      media: "elide",
    }
    const strategy = Compaction.strategy([rlmOffload({ keepRecentTokens: 128 })], base)
    const services = Layer.merge(
      Compaction.layer(strategy),
      configuredRlmLayer(root, leaf, { maxDepth: 1, maxSubCalls: 2 }),
    )

    yield* provideScoped(
      services,
      Effect.gen(function* () {
        const compaction = yield* Compaction.Compaction
        const compacted = yield* compaction.maybeCompact({
          compactionId: "rlm-offload-1",
          agentName: "rlm-offload",
          sessionId: "rlm-offload-session",
          turn: 2,
          history: Prompt.concat(compact, recent),
          prompt: Prompt.empty,
          usage: { contextTokens: 100, contextWindow: 10, reserveTokens: 0 },
          overflow: false,
        })
        const result = Option.getOrThrow(compacted)
        expect(result._tag).toBe("Summarize")
        if (result._tag !== "Summarize") return yield* Effect.die("expected an offload result")

        expect(yield* Schema.encodeEffect(PromptJson)(result.history)).not.toContain("Ada Lovelace")
        const response = yield* LanguageModel.generateText({ prompt: result.history })
        const probe = yield* Probe
        const requests = yield* root.requests
        const sources = yield* probe.sources
        const offloaded = (yield* probe.files).get(".generalist/rlm/offloaded-context.json")

        expect(response.text).toBe("The favorite programmer was Ada Lovelace.")
        expect(offloaded).toContain("Ada Lovelace")
        expect(yield* Schema.encodeEffect(PromptJson)(requests[1]?.prompt ?? Prompt.empty)).toContain("Ada Lovelace")
        expect(sources[0]).toContain("var offloadedContext = JSON.parse")
        expect(sources[0]).not.toContain("Ada Lovelace")
      }),
    )
  }),
)
