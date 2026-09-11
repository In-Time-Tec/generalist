import { objectRuntimeLayer } from "../runtime/execution/object.js"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { Agent } from "../../src/index.js"
import { cost as catalogCost, layerTest } from "../../src/ai/model-catalog.js"
import {
  SuiteResult,
  gatesPassed,
  judge,
  outputMatches,
  runSuite,
  score,
  toolCalledAtMost,
  usageUnder,
} from "../../src/eval/index.js"
import { ExecutableResolver } from "../../src/runtime/index.js"
import type { Trajectory } from "../../src/trajectory/index.js"
import { TestModel } from "../../src/testing/index.js"
import { provideScoped } from "../runtime/execution/scoped-provide.js"

const usage = Response.Usage.make({ inputTokens: { total: 1_000_000 }, outputTokens: { total: 1_000_000 } })
const trajectory: Trajectory = {
  runId: "run:eval",
  agent: "triage",
  input: Prompt.make("triage"),
  output: { severity: "high" },
  gates: [],
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
      usageFacts: [
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

const usageTrajectory = (provider: string, model: string, turnUsage: Response.Usage): Trajectory => ({
  runId: "run:eval",
  agent: "triage",
  input: Prompt.make("triage"),
  output: { severity: "high" },
  gates: [],
  stopReason: "stop",
  turns: [
    {
      prompt: Prompt.make("triage"),
      response: {
        content: [
          Response.makePart("text", { text: "high" }),
          Response.makePart("finish", { reason: "stop", usage: turnUsage }),
        ],
        usage: turnUsage,
        finishReason: "stop",
      },
      toolCalls: [],
      usageFacts: [
        {
          _tag: "Completed",
          runId: "run:eval",
          turn: 0,
          purpose: "conversation",
          modelCallId: "call-1",
          modelAttemptId: "attempt-1",
          attempt: 0,
          provider,
          model,
          usageAt: 1,
          usage: turnUsage,
        },
      ],
    },
  ],
})

it.effect("scores output schemas deterministically", () =>
  Effect.gen(function* () {
    const [pass, fail] = yield* score(trajectory, [
      outputMatches(Schema.Struct({ severity: Schema.Literal("high") })),
      outputMatches(Schema.Struct({ severity: Schema.Literal("low") })),
    ])
    expect(pass?.passed).toBe(true)
    expect(fail?.passed).toBe(false)
  }),
)

it.effect("scores the latest completion-gate verdicts", () =>
  Effect.gen(function* () {
    const [passed, failed] = yield* score(
      {
        ...trajectory,
        gates: [
          { name: "quality", verdict: "fail", evidence: "first" },
          { name: "quality", verdict: "pass", evidence: "retry" },
        ],
      },
      [gatesPassed()],
    ).pipe(
      Effect.zip(
        score({ ...trajectory, gates: [{ name: "quality", verdict: "fail", evidence: "rejected" }] }, [gatesPassed()]),
      ),
      Effect.map(([latestPass, latestFail]) => [latestPass[0], latestFail[0]] as const),
    )
    expect(passed).toMatchObject({ scorer: "gatesPassed", passed: true })
    expect(failed).toMatchObject({
      scorer: "gatesPassed",
      passed: false,
      message: "Failed completion gate(s): quality",
    })
  }),
)

it.effect("counts tool calls across turns", () =>
  Effect.gen(function* () {
    const [pass, fail] = yield* score(trajectory, [toolCalledAtMost("search", 2), toolCalledAtMost("search", 1)])
    expect(pass?.passed).toBe(true)
    expect(fail?.passed).toBe(false)
  }),
)

it.effect("checks token and bundled-catalog USD limits", () =>
  Effect.gen(function* () {
    const [pass, fail] = yield* score(trajectory, [
      usageUnder({ tokens: 2_000_000, usd: 0.75 }),
      usageUnder({ usd: 0.74 }),
    ])
    expect(pass).toMatchObject({ passed: true, message: "2000000 tokens; $0.750000" })
    expect(fail?.passed).toBe(false)
  }),
)

it.effect("prices cached bundled-catalog usage with the catalog price components", () =>
  Effect.gen(function* () {
    const cachedUsage = Response.Usage.make({
      inputTokens: { total: 23, uncached: 11, cacheRead: 7, cacheWrite: 5 },
      outputTokens: { total: 13, text: 8, reasoning: 5 },
    })
    const [scored, oracle] = yield* Effect.all([
      score(usageTrajectory("openai", "gpt-4o-mini", cachedUsage), [usageUnder({ usd: 0.001 })]),
      catalogCost({ provider: "openai", model: "gpt-4o-mini" }, cachedUsage),
    ])
    expect(oracle).toEqual(Option.some(0.00001125))
    expect(scored[0]).toMatchObject({ passed: true, message: "36 tokens; $0.000011" })
  }),
)

it.effect("prices declared uncached input with separate cache rates", () =>
  Effect.gen(function* () {
    const declaredUsage = Response.Usage.make({
      inputTokens: { total: 100, uncached: 80, cacheRead: 10, cacheWrite: 10 },
      outputTokens: { total: 0 },
    })
    const catalog = layerTest([
      {
        provider: "stress",
        model: "priced",
        contextWindow: 8_192,
        maxOutput: 1_024,
        logprobs: false,
        pricing: { inputPerMTok: 1, outputPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 0.1 },
      },
    ])
    const [tight, loose, over, oracle] = yield* provideScoped(
      catalog,
      Effect.all([
        score(usageTrajectory("stress", "priced", declaredUsage), [usageUnder({ usd: 0.000085 })]),
        score(usageTrajectory("stress", "priced", declaredUsage), [usageUnder({ usd: 0.001 })]),
        score(usageTrajectory("stress", "priced", declaredUsage), [usageUnder({ usd: 0.00008 })]),
        catalogCost({ provider: "stress", model: "priced" }, declaredUsage),
      ]),
    )
    expect(oracle).toEqual(Option.some(0.000082))
    expect(tight[0]).toMatchObject({ passed: true, message: "100 tokens; $0.000082" })
    expect(loose[0]?.passed).toBe(true)
    expect(over[0]?.passed).toBe(false)
  }),
)

it.effect("prefers a declared uncached count over the derived total", () =>
  Effect.gen(function* () {
    const splitUsage = Response.Usage.make({
      inputTokens: { total: 100, uncached: 70, cacheRead: 10, cacheWrite: 10 },
      outputTokens: { total: 0 },
    })
    const catalog = layerTest([
      {
        provider: "stress",
        model: "priced",
        contextWindow: 8_192,
        maxOutput: 1_024,
        logprobs: false,
        pricing: { inputPerMTok: 1, outputPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 0.1 },
      },
    ])
    const [within, beyond, oracle] = yield* provideScoped(
      catalog,
      Effect.all([
        score(usageTrajectory("stress", "priced", splitUsage), [usageUnder({ usd: 0.000075 })]),
        score(usageTrajectory("stress", "priced", splitUsage), [usageUnder({ usd: 0.00007 })]),
        catalogCost({ provider: "stress", model: "priced" }, splitUsage),
      ]),
    )
    expect(oracle).toEqual(Option.some(0.000072))
    expect(within[0]).toMatchObject({ passed: true, message: "100 tokens; $0.000072" })
    expect(beyond[0]?.passed).toBe(false)
  }),
)

it.effect("reports unknown USD only when catalog pricing is unavailable", () =>
  Effect.gen(function* () {
    const plainUsage = Response.Usage.make({ inputTokens: { total: 10 }, outputTokens: { total: 5 } })
    const unknownModel = yield* score(usageTrajectory("openai", "not-in-catalog", plainUsage), [usageUnder({ usd: 1 })])
    const unpriced = yield* provideScoped(
      layerTest([{ provider: "stress", model: "unpriced", contextWindow: 1, maxOutput: 1, logprobs: false }]),
      score(usageTrajectory("stress", "unpriced", plainUsage), [usageUnder({ usd: 1 })]),
    )
    expect(unknownModel[0]).toMatchObject({
      passed: false,
      message: "USD is unknown because model identity or catalog pricing is unavailable",
    })
    expect(unpriced[0]).toMatchObject({
      passed: false,
      message: "USD is unknown because model identity or catalog pricing is unavailable",
    })
  }),
)

it.effect("prices failed-attempt provider usage with the bundled catalog", () =>
  Effect.gen(function* () {
    const base = usageTrajectory("openai", "gpt-4o-mini", usage)
    const failed: Trajectory = {
      ...base,
      turns: [
        {
          ...base.turns[0]!,
          usageFacts: [
            {
              _tag: "Failed",
              runId: "run:eval",
              turn: 0,
              purpose: "conversation",
              modelCallId: "call-1",
              modelAttemptId: "attempt-1",
              attempt: 0,
              provider: "openai",
              model: "gpt-4o-mini",
              category: "transport",
              usageAt: 1,
              providerUsage: { inputTokens: 10_000_000, outputTokens: 5_000_000 },
            },
          ],
        },
      ],
    }
    const [pass, fail] = yield* score(failed, [usageUnder({ tokens: 15_000_000, usd: 4.5 }), usageUnder({ usd: 4.4 })])
    expect(pass).toMatchObject({ passed: true, message: "15000000 tokens; $4.500000" })
    expect(fail?.passed).toBe(false)
  }),
)

it.effect("uses the required LanguageModel for judge", () =>
  Effect.gen(function* () {
    const fixture = yield* TestModel.make([TestModel.object({ passed: true, reason: "faithful" })])
    const [matched, judged] = yield* score(trajectory, [
      outputMatches(Schema.Struct({ severity: Schema.Literal("high") })),
      judge({ rubric: "faithful", model: "scripted" }),
    ]).pipe((effect) => provideScoped(fixture.layer, effect))
    expect(matched?.passed).toBe(true)
    expect(judged).toMatchObject({ scorer: "judge:scripted", passed: true, message: "faithful" })
  }),
)

it.live("runs a bounded suite through Runtime and prints its schema result", () =>
  Effect.gen(function* () {
    const fixture = yield* TestModel.make([TestModel.text("high")])
    const agent = Agent.make({ name: "eval-suite" })
    const runtime = objectRuntimeLayer({ addresses: [], schedulerMode: "poll" }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
    )
    const suite = yield* runSuite(agent, ["classify"], [outputMatches(Schema.String)], {
      concurrency: 1,
    }).pipe((effect) => provideScoped(Layer.merge(runtime, fixture.layer), effect))

    expect(Schema.is(SuiteResult)(suite)).toBe(true)
    expect(suite.rows[0]).toMatchObject({ output: "high", scores: [{ passed: true }] })
  }),
)
