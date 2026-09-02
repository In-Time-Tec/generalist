import { expect, it } from "@effect/vitest"
import { Effect, Layer, pipe, Ref, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Memo } from "../../src/index.js"
import { outputMatches, runSuite } from "../../src/eval/index.js"
import { ExecutableResolver, Runtime } from "../../src/runtime/index.js"
import { TestModel } from "../../src/testing/index.js"
import { fromJournal } from "../../src/trajectory/index.js"
import { allowAllAuthorization } from "../authorization.js"
import { provideScoped } from "../runtime/execution/scoped-provide.js"

const MemoizedCompletion = Schema.TaggedStruct("ToolExecutionCompleted", {
  result: Schema.Struct({
    memoized: Schema.Struct({ fromRun: Schema.String, fromOperation: Schema.String }),
  }),
})

it.live("runs an eval suite twice without a second tool dispatch", () =>
  Effect.gen(function* () {
    const dispatches = yield* Ref.make(0)
    const Search = pipe(
      Tool.make("memo_eval_search", {
        parameters: Schema.Struct({ query: Schema.String }),
        success: Schema.String,
      }),
      Memo.pure({ ttl: "1 hour", dependsOn: ["index"] }),
    )
    const toolkit = Toolkit.make(Search)
    const fixture = yield* TestModel.make([
      TestModel.toolCall("memo_eval_search", { query: "effect" }, { id: "search-1" }),
      TestModel.text("done"),
      TestModel.text("done"),
    ])
    const runtime = Runtime.layerMemory({ addresses: [] }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
    )
    const services = Layer.mergeAll(
      runtime,
      fixture.registryLayer,
      allowAllAuthorization,
      toolkit.toLayer({
        memo_eval_search: () => Ref.update(dispatches, (count) => count + 1).pipe(Effect.as("result")),
      }),
      Memo.layerMemory({ models: Memo.models({ enabled: true }) }),
      Memo.layerDependencies({
        tenant: "eval-tenant",
        capabilityScope: "search:read",
        versions: { index: "v1" },
      }),
    )
    const run = (name: string) =>
      runSuite(
        Agent.make({ name, toolkit, model: fixture.selection }),
        ["search"],
        [outputMatches(Schema.Literal("done"))],
        { concurrency: 1 },
      )

    const [first, second, secondTrajectory, secondCompletion] = yield* Effect.gen(function* () {
      const firstSuite = yield* run("memo-eval-first")
      const secondSuite = yield* run("memo-eval-second")
      const activeRuntime = yield* Runtime.Runtime
      const runId = secondSuite.rows[0]!.runId
      const trajectory = yield* fromJournal(activeRuntime, runId)
      const history = yield* activeRuntime.history({ runId, limit: 1_000 })
      const completion = history.find((event) => event._tag === "ToolExecutionCompleted")
      const memoized = (yield* Schema.decodeUnknownEffect(MemoizedCompletion)(completion)).result.memoized
      return [firstSuite, secondSuite, trajectory, memoized] as const
    }).pipe((effect) => provideScoped(services, effect))

    expect(first.rows[0]?.output).toBe("done")
    expect(second.rows[0]?.output).toBe("done")
    expect(secondTrajectory.turns.flatMap((turn) => turn.toolCalls)).toHaveLength(1)
    expect(secondCompletion).toMatchObject({
      fromRun: first.rows[0]?.runId,
    })
    expect(yield* Ref.get(dispatches)).toBe(1)
    expect((yield* fixture.requests).length).toBeLessThan(4)
  }),
)
