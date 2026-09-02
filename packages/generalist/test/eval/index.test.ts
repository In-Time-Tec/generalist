import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { Agent } from "../../src/index.js"
import * as Eval from "../../src/eval/index.js"
import { ExecutableResolver, Runtime } from "../../src/runtime/index.js"
import type { Trajectory } from "../../src/trajectory/index.js"
import { TestModel } from "../../src/testing/index.js"
import { provideScoped } from "../runtime/execution/scoped-provide.js"

const usage = Response.Usage.make({ inputTokens: { total: 1_000_000 }, outputTokens: { total: 1_000_000 } })
const trajectory: Trajectory = {
  runId: "run:eval",
  agent: "triage",
  input: Prompt.make("triage"),
  output: { severity: "high" },
  stopReason: "stop",
  turns: [
    {
      prompt: Prompt.make("triage"),
      response: {
        content: [
          Response.makePart("text", { text: "high" }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        ],
        usage,
        finishReason: "stop",
      },
      toolCalls: [
        { id: "search-1", name: "search", params: { q: "one" }, result: [] },
        { id: "search-2", name: "search", params: { q: "two" }, result: [] },
      ],
      usage: [
        {
          _tag: "Completed",
          runId: "run:eval",
          turn: 0,
          purpose: "conversation",
          modelCallId: "call-1",
          modelAttemptId: "attempt-1",
          attempt: 0,
          provider: "openai",
          model: "gpt-4o-mini",
          usageAt: 1,
          usage,
        },
      ],
    },
  ],
}

it.effect("scores output schemas deterministically", () =>
  Effect.gen(function* () {
    const [pass, fail] = yield* Eval.score(trajectory, [
      Eval.outputMatches(Schema.Struct({ severity: Schema.Literal("high") })),
      Eval.outputMatches(Schema.Struct({ severity: Schema.Literal("low") })),
    ])
    expect(pass?.passed).toBe(true)
    expect(fail?.passed).toBe(false)
  }),
)

it.effect("counts tool calls across turns", () =>
  Effect.gen(function* () {
    const [pass, fail] = yield* Eval.score(trajectory, [
      Eval.toolCalledAtMost("search", 2),
      Eval.toolCalledAtMost("search", 1),
    ])
    expect(pass?.passed).toBe(true)
    expect(fail?.passed).toBe(false)
  }),
)

it.effect("checks token and bundled-catalog USD limits", () =>
  Effect.gen(function* () {
    const [pass, fail] = yield* Eval.score(trajectory, [
      Eval.usageUnder({ tokens: 2_000_000, usd: 0.75 }),
      Eval.usageUnder({ usd: 0.74 }),
    ])
    expect(pass).toMatchObject({ passed: true, message: "2000000 tokens; $0.750000" })
    expect(fail?.passed).toBe(false)
  }),
)

it.effect("uses the required LanguageModel for judge", () =>
  Effect.gen(function* () {
    const fixture = yield* TestModel.make([TestModel.object({ passed: true, reason: "faithful" })])
    const [matched, judged] = yield* Eval.score(trajectory, [
      Eval.outputMatches(Schema.Struct({ severity: Schema.Literal("high") })),
      Eval.judge({ rubric: "faithful", model: "scripted" }),
    ]).pipe((effect) => provideScoped(fixture.layer, effect))
    expect(matched?.passed).toBe(true)
    expect(judged).toMatchObject({ scorer: "judge:scripted", passed: true, message: "faithful" })
  }),
)

it.live("runs a bounded suite through Runtime and prints its schema result", () =>
  Effect.gen(function* () {
    const fixture = yield* TestModel.make([TestModel.text("high")])
    const agent = Agent.make({ name: "eval-suite" })
    const runtime = Runtime.layerMemory({ addresses: [] }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
    )
    const suite = yield* Eval.runSuite(agent, ["classify"], [Eval.outputMatches(Schema.String)], {
      concurrency: 1,
    }).pipe((effect) => provideScoped(Layer.merge(runtime, fixture.layer), effect))

    expect(Schema.is(Eval.SuiteResult)(suite)).toBe(true)
    expect(suite.rows[0]).toMatchObject({ output: "high", scores: [{ passed: true }] })
  }),
)
