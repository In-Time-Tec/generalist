/* oxlint-disable typescript/no-unsafe-type-assertion -- Gate definitions retain precise types that the Agent interface erases after construction. */
/* oxlint-disable effecttsgo/strict-effect-provide -- the fresh verifier is an isolated child-run entry boundary. */
import { Cause, Effect, Layer, Schema } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { layerEmpty as emptySkills } from "../../context/skill-catalog.js"
import { DriverInterpreter, DriverJournal, journalNoop } from "../../durable/driver/interpreter.js"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import { DriverStateInvalid, type DriverError } from "../../durable/service.js"
import { layerIdentity as identityMiddleware } from "../../model/middleware.js"
import { layerIdentity as identityHooks } from "../../../hooks/index.js"
import type { SandboxService } from "../../../sandbox/service.js"
import { AgentError, type Event } from "../event.js"
import type { Agent } from "../lifecycle/definition.js"
import type { RunError } from "../run/error.js"
import { VerifierOutput, type Gate, type Result, type Verifier, type VerifierAgent } from "./definition.js"
import { verifierPrompt } from "./prompt.js"

const isolatedEnvironment = Layer.mergeAll(
  Layer.succeed(DriverJournal, journalNoop),
  identityHooks,
  identityMiddleware,
  emptySkills,
)

export interface VerifierRun {
  readonly runId: string
  readonly events: ReadonlyArray<Event>
}

export interface VerifierRunner {
  <R>(agent: VerifierAgent<R>, prompt: Prompt.Prompt): Effect.Effect<VerifierRun, RunError, R>
}

const errorText = (cause: Cause.Cause<unknown>): string => {
  const squashed = Cause.squash(cause)
  return squashed instanceof Error ? `${squashed.name}: ${squashed.message}` : String(squashed)
}

const catchAsFailure = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
  onSuccess: (value: A) => Result,
): Effect.Effect<Result, never, R> =>
  effect.pipe(
    Effect.matchCauseEffect({
      onFailure: (cause) =>
        Cause.hasInterrupts(cause)
          ? Effect.interrupt
          : Effect.succeed({ name, verdict: "fail", evidence: { error: errorText(cause) } }),
      onSuccess: (value) => Effect.succeed(onSuccess(value)),
    }),
  )

const commandResult = <Output, R>(
  agent: { readonly sandbox?: SandboxService },
  gate: Extract<Gate<Output, R>, { readonly _tag: "Command" }>,
): Effect.Effect<Result> => {
  const sandbox = agent.sandbox
  if (sandbox === undefined) {
    return Effect.succeed({ name: gate.name, verdict: "fail", evidence: { error: "Sandbox is unavailable" } })
  }
  return catchAsFailure(
    gate.name,
    sandbox.exec({ _tag: "Process", command: "sh", arguments: ["-lc", gate.run] }),
    (execution) => ({
      name: gate.name,
      verdict: execution.exitCode === 0 ? "pass" : "fail",
      evidence: {
        command: gate.run,
        exitCode: execution.exitCode,
        stdout: execution.stdout,
        stderr: execution.stderr,
      },
    }),
  )
}

const predicateResult = <Output, R>(
  gate: Extract<Gate<Output, R>, { readonly _tag: "Predicate" }>,
  output: Output,
): Effect.Effect<Result, never, R> =>
  catchAsFailure(
    gate.name,
    Effect.suspend(() => {
      const checked = gate.check(output)
      // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- predicate failures become journaled gate evidence.
      return Effect.isEffect(checked) ? checked : Effect.succeed(checked)
    }),
    (passed) => ({
      name: gate.name,
      verdict: passed ? "pass" : "fail",
      evidence: { passed },
    }),
  )

const isolatedVerifier = <R>(gate: Verifier<R>): VerifierAgent<R> => {
  const isolated = {
    ...gate.agent,
    toolkit: Toolkit.empty,
    toolDeclarations: [],
    toolScheduling: { maxConcurrency: 1, parallelSafe: [] },
    memory: undefined,
    gates: [],
    onGateFailure: "fail",
    sandbox: undefined,
  }
  // SAFETY: Gate.verifier retains the Agent's requirement type in R; only tool-bearing and inherited seams are removed.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- this is the one type-erasure boundary for the stripped Agent.
  return isolated as unknown as VerifierAgent<R>
}

interface VerifierEvidence {
  readonly runId: string
  readonly turns: number
  readonly score: number
  readonly evidence: Schema.Json
}

const runVerifier = <R>(
  runner: VerifierRunner,
  gate: Verifier<R>,
  output: typeof Schema.Unknown.Type,
): Effect.Effect<VerifierEvidence, RunError | Schema.SchemaError, R> =>
  Effect.gen(function* () {
    const handle = yield* runner(isolatedVerifier(gate), verifierPrompt(output)).pipe(
      Effect.provide(isolatedEnvironment),
    )
    const completed = handle.events.findLast((event) => event._tag === "Completed")
    if (completed?._tag !== "Completed")
      return yield* AgentError.make({ message: "Verifier ended without a Completed event", turn: 0 })
    const decision = yield* Schema.decodeUnknownEffect(VerifierOutput)(completed.output)
    return {
      runId: handle.runId,
      turns: completed.turns,
      score: decision.score,
      evidence: decision.evidence,
    }
  })

const verifierResult = <R>(
  runner: VerifierRunner,
  gate: Verifier<R>,
  output: typeof Schema.Unknown.Type,
): Effect.Effect<Result, never, R> =>
  catchAsFailure(gate.name, runVerifier(runner, gate, output), (result) => ({
    name: gate.name,
    verdict: result.score >= gate.threshold ? "pass" : "fail",
    evidence: { ...result, threshold: gate.threshold },
  }))

const runGate = <Output, R>(
  runner: VerifierRunner,
  agent: { readonly sandbox?: SandboxService },
  gate: Gate<Output, R>,
  output: Output,
): Effect.Effect<Result, never, R> => {
  if (gate._tag === "Command") return commandResult(agent, gate)
  if (gate._tag === "Predicate") return predicateResult(gate, output)
  return verifierResult(runner, gate, output)
}

const recordedResults = Effect.fn("Gate.recordedResults")(function* () {
  const interpreter = yield* DriverInterpreter
  const checkpoint = yield* interpreter.checkpoint
  const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state).pipe(
    Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
  )
  return new Map((state.gates ?? []).map((entry) => [entry.key, entry] as const))
})

export interface Evaluation {
  readonly results: ReadonlyArray<Result>
  readonly failed?: Result
}

/** Run or replay the ordered gates for one proposed terminal value. */
export const evaluate = <Tools extends Record<string, Tool.Any>, R, P extends R, A extends R, Output>(input: {
  readonly agent: Agent<Tools, R, P, A, Schema.Top, Schema.Top>
  readonly runVerifier: VerifierRunner
  readonly turn: number
  readonly output: Output
}): Effect.Effect<Evaluation, DriverError | DriverStateInvalid, R | DriverInterpreter> =>
  Effect.gen(function* () {
    const interpreter = yield* DriverInterpreter
    const recorded = yield* recordedResults()
    const results: Array<Result> = []
    for (const [index, currentGate] of input.agent.gates.entries()) {
      // SAFETY: Agent.make validates and stores the output-compatible gates supplied in its typed options.
      const gate = currentGate as Gate<Output, R>
      const key = `gate:${input.turn}:${index}`
      const prior = recorded.get(key)
      if (prior !== undefined && (prior.turn !== input.turn || prior.result.name !== gate.name)) {
        return yield* DriverStateInvalid.make({ message: `Gate checkpoint ${key} does not match ${gate.name}` })
      }
      const evaluated = prior?.result ?? (yield* runGate(input.runVerifier, input.agent, gate, input.output))
      const checkpoint = prior ?? (yield* interpreter.recordGateResult({ key, turn: input.turn, result: evaluated }))
      if (checkpoint.result.name !== gate.name) {
        return yield* DriverStateInvalid.make({ message: `Gate checkpoint ${key} does not match ${gate.name}` })
      }
      results.push(checkpoint.result)
      if (checkpoint.result.verdict === "fail") return { results, failed: checkpoint.result }
    }
    return { results }
  })
