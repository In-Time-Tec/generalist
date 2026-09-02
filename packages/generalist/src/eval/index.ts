import { Console, Effect, Function, Option, Schema, Types } from "effect"
import { type AiError, LanguageModel, type Tool } from "effect/unstable/ai"
import type { Agent, ClosedServices } from "../core/agent/lifecycle/definition.js"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import { ModelCatalog, bundled, type Metadata as ModelMetadata } from "../ai/model-catalog.js"
import type { InvalidOutput } from "../core/agent/event.js"
import type { DuplicateAgent } from "../runtime/errors.js"
import type { RunCancelled, RunFailed } from "../runtime/run/event.js"
import { Runtime, type EventsError, type StartError } from "../runtime/service.js"
import { fromJournal, type FromJournalError, type Trajectory } from "../trajectory/index.js"

export const Score = Schema.Struct({
  scorer: Schema.String,
  passed: Schema.Boolean,
  value: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  message: Schema.optionalKey(Schema.String),
})
export type Score = typeof Score.Type

export interface Scorer<R = never, E = never> {
  readonly name: string
  readonly evaluate: (trajectory: Trajectory) => Effect.Effect<Score, E, R>
}

const result = (scorer: string, passed: boolean, message?: string): Score => {
  const score: Types.Mutable<Score> = { scorer, passed, value: passed ? 1 : 0 }
  if (message !== undefined) score.message = message
  return score
}

/** Evaluate one trajectory with all scorers in declaration order. */
export const score: {
  <R, E>(scorers: ReadonlyArray<Scorer<R, E>>): (trajectory: Trajectory) => Effect.Effect<ReadonlyArray<Score>, E, R>
  <R, E>(trajectory: Trajectory, scorers: ReadonlyArray<Scorer<R, E>>): Effect.Effect<ReadonlyArray<Score>, E, R>
} = Function.dual(2, <R, E>(trajectory: Trajectory, scorers: ReadonlyArray<Scorer<R, E>>) =>
  Effect.forEach(scorers, (scorer) => scorer.evaluate(trajectory), { concurrency: 1 }),
)

export const outputMatches = <OutputSchema extends Schema.Top>(
  schema: OutputSchema,
): Scorer<OutputSchema["DecodingServices"]> => ({
  name: "outputMatches",
  evaluate: (trajectory) =>
    Schema.decodeUnknownEffect(schema)(trajectory.output).pipe(
      Effect.match({
        onFailure: (error) => result("outputMatches", false, error.message),
        onSuccess: () => result("outputMatches", true),
      }),
    ),
})

/** Score whether the latest verdict for every completion gate passed. */
export const gatesPassed = (): Scorer => ({
  name: "gatesPassed",
  evaluate: (trajectory) => {
    const latest = new Map(trajectory.gates.map((gate) => [gate.name, gate] as const))
    const failed = [...latest.values()].filter((gate) => gate.verdict === "fail")
    const message =
      failed.length === 0
        ? `${latest.size} completion gate(s) passed`
        : `Failed completion gate(s): ${failed.map((gate) => gate.name).join(", ")}`
    return Effect.succeed(result("gatesPassed", failed.length === 0, message))
  },
})

export const toolCalledAtMost: {
  (maximum: number): (tool: string) => Scorer
  (tool: string, maximum: number): Scorer
} = Function.dual(2, (tool: string, maximum: number): Scorer => {
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw new TypeError("maximum must be a non-negative safe integer")
  return {
    name: `toolCalledAtMost:${tool}`,
    evaluate: (trajectory) => {
      const calls = trajectory.turns.reduce(
        (count, turn) => count + turn.toolCalls.filter((call) => call.name === tool).length,
        0,
      )
      return Effect.succeed(
        result(`toolCalledAtMost:${tool}`, calls <= maximum, `${tool} was called ${calls} time(s); limit ${maximum}`),
      )
    },
  }
})

export interface UsageLimit {
  readonly usd?: number
  readonly tokens?: number
}

interface UsageTotal {
  readonly tokens: number
  readonly usd: Option.Option<number>
}

interface TokenCounts {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly total: number
}

const completedTokens = (usage: Trajectory["turns"][number]["usage"][number]): TokenCounts => {
  if (usage._tag === "Failed") {
    const input = usage.providerUsage.inputTokens ?? 0
    const output = usage.providerUsage.outputTokens ?? 0
    return { input, output, cacheRead: 0, cacheWrite: 0, total: usage.providerUsage.totalTokens ?? input + output }
  }
  const input = usage.usage.inputTokens.total ?? usage.usage.inputTokens.uncached ?? 0
  const output = usage.usage.outputTokens.total ?? 0
  return {
    input,
    output,
    cacheRead: usage.usage.inputTokens.cacheRead ?? 0,
    cacheWrite: usage.usage.inputTokens.cacheWrite ?? 0,
    total: input + output,
  }
}

const metadataFrom = (entries: ReadonlyArray<ModelMetadata>, provider: string, model: string) =>
  entries.find((entry) => entry.provider === provider && entry.model === model)

const factCost = (
  fact: Trajectory["turns"][number]["usage"][number],
  metadata: ModelMetadata | undefined,
): Option.Option<number> => {
  if (metadata?.pricing === undefined) return Option.none()
  const usage = completedTokens(fact)
  const uncached = Math.max(0, usage.input - usage.cacheRead)
  const pricing = metadata.pricing
  if (uncached > 0 && pricing.inputPerMTok === undefined) return Option.none()
  if (usage.output > 0 && pricing.outputPerMTok === undefined) return Option.none()
  if (usage.cacheRead > 0 && pricing.cacheReadPerMTok === undefined) return Option.none()
  if (usage.cacheWrite > 0 && pricing.cacheWritePerMTok === undefined) return Option.none()
  const usd =
    (uncached * (pricing.inputPerMTok ?? 0) +
      usage.output * (pricing.outputPerMTok ?? 0) +
      usage.cacheRead * (pricing.cacheReadPerMTok ?? 0) +
      usage.cacheWrite * (pricing.cacheWritePerMTok ?? 0)) /
    1_000_000
  return Option.some(usd)
}

const usageTotal = Effect.fn("Eval.usageTotal")(function* (trajectory: Trajectory) {
  const catalog = yield* Effect.serviceOption(ModelCatalog)
  const facts = trajectory.turns.flatMap((turn) => turn.usage)
  let tokens = 0
  let usd: Option.Option<number> = Option.some(0)
  for (const fact of facts) {
    const counts = completedTokens(fact)
    tokens += counts.total
    if (Option.isNone(usd) || fact.provider === undefined || fact.model === undefined) {
      usd = Option.none()
      continue
    }
    const metadata = Option.isSome(catalog)
      ? yield* catalog.value.find({ provider: fact.provider, model: fact.model })
      : metadataFrom(bundled, fact.provider, fact.model)
    const cost = factCost(fact, metadata)
    usd = Option.isNone(cost) ? Option.none() : Option.some(usd.value + cost.value)
  }
  return { tokens, usd } satisfies UsageTotal
})

export const usageUnder = (limit: UsageLimit): Scorer => {
  if (limit.usd === undefined && limit.tokens === undefined) throw new TypeError("usageUnder requires usd or tokens")
  if (limit.usd !== undefined && (!Number.isFinite(limit.usd) || limit.usd < 0))
    throw new TypeError("usd must be finite and non-negative")
  if (limit.tokens !== undefined && (!Number.isSafeInteger(limit.tokens) || limit.tokens < 0))
    throw new TypeError("tokens must be a non-negative safe integer")
  return {
    name: "usageUnder",
    evaluate: (trajectory) =>
      usageTotal(trajectory).pipe(
        Effect.map((usage) => {
          if (limit.usd !== undefined && Option.isNone(usage.usd)) {
            return result(
              "usageUnder",
              false,
              "USD is unknown because model identity or catalog pricing is unavailable",
            )
          }
          const tokensPass = limit.tokens === undefined || usage.tokens <= limit.tokens
          const usdPass = limit.usd === undefined || (Option.isSome(usage.usd) && usage.usd.value <= limit.usd)
          const usdText = Option.isSome(usage.usd) ? usage.usd.value.toFixed(6) : "unknown"
          return result("usageUnder", tokensPass && usdPass, `${usage.tokens} tokens; $${usdText}`)
        }),
      ),
  }
}

const JudgeDecision = Schema.Struct({ passed: Schema.Boolean, reason: Schema.String })

export interface JudgeOptions {
  readonly rubric: string
  /** Stable label for the supplied LanguageModel, included in score output. */
  readonly model: string
}

/** Score with the LanguageModel supplied in the Effect environment. */
export const judge = (options: JudgeOptions): Scorer<LanguageModel.LanguageModel, AiError.AiError> => ({
  name: `judge:${options.model}`,
  evaluate: (trajectory) =>
    LanguageModel.generateObject({
      prompt: `Evaluate the trajectory output against the rubric.\n\nRubric: ${options.rubric}\n\nOutput: ${JSON.stringify(trajectory.output)}`,
      objectName: "evaluation",
      schema: JudgeDecision,
    }).pipe(Effect.map(({ value }) => result(`judge:${options.model}`, value.passed, value.reason))),
})

export const SuiteRow = Schema.Struct({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  runId: Schema.String,
  output: Schema.Unknown,
  scores: Schema.Array(Score),
})
export type SuiteRow = typeof SuiteRow.Type

export const SuiteResult = Schema.Struct({
  agent: Schema.String,
  rows: Schema.Array(SuiteRow),
})
export type SuiteResult = typeof SuiteResult.Type

export interface SuiteOptions {
  readonly concurrency: number
}

export class InvalidSuiteOptions extends ActionableTaggedError<InvalidSuiteOptions>()(
  "generalist/eval/InvalidSuiteOptions",
  {
    message: Schema.String,
    hint: errorHint("Set concurrency to an integer greater than zero."),
  },
) {}

const table = (suite: SuiteResult): string => {
  const headings = ["case", "run", ...new Set(suite.rows.flatMap((row) => row.scores.map((item) => item.scorer)))]
  const rows = suite.rows.map((row) => [
    String(row.index),
    row.runId,
    ...headings
      .slice(2)
      .map((heading) => (row.scores.find((item) => item.scorer === heading)?.passed === true ? "pass" : "fail")),
  ])
  const widths = headings.map((heading, index) => Math.max(heading.length, ...rows.map((row) => row[index]!.length)))
  const render = (row: ReadonlyArray<string>) => row.map((cell, index) => cell.padEnd(widths[index]!)).join(" | ")
  return [render(headings), widths.map((width) => "-".repeat(width)).join("-+-"), ...rows.map(render)].join("\n")
}

type SuiteError<E> =
  | E
  | StartError
  | DuplicateAgent
  | RunFailed
  | RunCancelled
  | EventsError
  | InvalidOutput
  | FromJournalError
  | InvalidSuiteOptions

interface RunSuite {
  <
    Tools extends Record<string, Tool.Any>,
    AgentRequirements,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
    ScorerRequirements,
    ScorerError,
  >(
    dataset: ReadonlyArray<InputSchema["Type"]>,
    scorers: ReadonlyArray<Scorer<ScorerRequirements, ScorerError>>,
    options: SuiteOptions,
  ): (
    agent: Agent<Tools, AgentRequirements, AgentRequirements, AgentRequirements, InputSchema, OutputSchema>,
  ) => Effect.Effect<
    SuiteResult,
    SuiteError<ScorerError>,
    Runtime | ClosedServices<Tools, AgentRequirements, InputSchema, OutputSchema> | ScorerRequirements
  >
  <
    Tools extends Record<string, Tool.Any>,
    AgentRequirements,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
    ScorerRequirements,
    ScorerError,
  >(
    agent: Agent<Tools, AgentRequirements, AgentRequirements, AgentRequirements, InputSchema, OutputSchema>,
    dataset: ReadonlyArray<InputSchema["Type"]>,
    scorers: ReadonlyArray<Scorer<ScorerRequirements, ScorerError>>,
    options: SuiteOptions,
  ): Effect.Effect<
    SuiteResult,
    SuiteError<ScorerError>,
    Runtime | ClosedServices<Tools, AgentRequirements, InputSchema, OutputSchema> | ScorerRequirements
  >
}

/** Run a typed Agent over a dataset through Runtime, score each journal, and print a plain-text table. */
export const runSuite: RunSuite = Function.dual(
  4,
  <
    Tools extends Record<string, Tool.Any>,
    AgentRequirements,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
    ScorerRequirements,
    ScorerError,
  >(
    agent: Agent<Tools, AgentRequirements, AgentRequirements, AgentRequirements, InputSchema, OutputSchema>,
    dataset: ReadonlyArray<InputSchema["Type"]>,
    scorers: ReadonlyArray<Scorer<ScorerRequirements, ScorerError>>,
    options: SuiteOptions,
  ): Effect.Effect<
    SuiteResult,
    SuiteError<ScorerError>,
    Runtime | ClosedServices<Tools, AgentRequirements, InputSchema, OutputSchema> | ScorerRequirements
  > =>
    Effect.gen(function* () {
      if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1) {
        return yield* InvalidSuiteOptions.make({ message: "concurrency must be a positive safe integer" })
      }
      const runtime = yield* Runtime
      yield* runtime.register(agent)
      const rows = yield* Effect.forEach(
        dataset,
        (input, index) =>
          Effect.gen(function* () {
            const handle = yield* runtime.start(agent, input)
            yield* handle.await
            const trajectory = yield* fromJournal(runtime, handle.runId)
            return { index, runId: handle.runId, output: trajectory.output, scores: yield* score(trajectory, scorers) }
          }),
        { concurrency: options.concurrency },
      )
      const suite = { agent: agent.name, rows }
      yield* Console.log(table(suite))
      return suite
    }),
)
