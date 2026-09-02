import { Effect, Schema } from "effect"
import type { Tool } from "effect/unstable/ai"
import type { Agent, Any as AnyAgent, Requirements as AgentRequirements } from "../lifecycle/definition.js"
import { ActionableTaggedError, errorHint } from "../../error-hint.js"
import type { SandboxService } from "../../../sandbox/service.js"

/** Whether one completion gate accepted or rejected a proposed terminal output. */
export const Verdict = Schema.Literals(["pass", "fail"])
export type Verdict = typeof Verdict.Type

/** Journaled evidence from one completion-gate decision. */
export const Result = Schema.Struct({
  name: Schema.String,
  verdict: Verdict,
  evidence: Schema.Json,
})
export type Result = typeof Result.Type

/** Structured output required from a verifier Agent. */
export const VerifierOutput = Schema.Struct({
  score: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  evidence: Schema.Json,
})
export type VerifierOutput = typeof VerifierOutput.Type

/** Run one shell command in the Sandbox owned by the proposing Agent. */
export interface Command {
  readonly _tag: "Command"
  readonly name: string
  readonly run: string
}

/** Run one independent Agent and compare its structured score to a threshold. */
export interface Verifier<R = never> {
  readonly _tag: "Verifier"
  readonly name: string
  readonly agent: AnyAgent
  readonly threshold: number
  readonly requirements?: () => R
}

/** Evaluate application code against the decoded proposed output. */
export interface Predicate<in Output = unknown, R = never> {
  readonly _tag: "Predicate"
  readonly name: string
  readonly check: (output: Output) => boolean | Effect.Effect<boolean, unknown, R>
  readonly requirements?: () => R
}

/** One ordered completion gate. */
export type Gate<Output = unknown, R = never> = Command | Verifier<R> | Predicate<Output, R>

/** One Gate with its output and requirement types hidden. */
export type Any = Gate<never, unknown>

/** Extract a Gate's Effect requirements. */
export type Requirements<G> = G extends Verifier<infer R> | Predicate<never, infer R> ? R : never

/** Behavior after the first gate that rejects a proposed output. */
export type FailureMode = "retry" | "fail"

const validateName = (name: string): void => {
  if (name.length === 0) throw new TypeError("Gate name must not be empty")
}

/** Construct a Sandbox command completion gate. */
export const command = (options: { readonly name: string; readonly run: string }): Command => {
  validateName(options.name)
  if (options.run.length === 0) throw new TypeError("Gate command must not be empty")
  return { _tag: "Command", name: options.name, run: options.run }
}

/** Construct an isolated Agent verifier completion gate. */
export const verifier = <A extends AnyAgent>(options: {
  readonly name: string
  readonly agent: A
  readonly threshold: number
}): Verifier<AgentRequirements<A>> => {
  validateName(options.name)
  if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 1) {
    throw new TypeError("Gate verifier threshold must be between 0 and 1")
  }
  return {
    _tag: "Verifier",
    name: options.name,
    agent: options.agent,
    threshold: options.threshold,
  }
}

/** Construct an application predicate completion gate. */
export const predicate = <Output, R = never>(options: {
  readonly name: string
  readonly check: (output: Output) => boolean | Effect.Effect<boolean, unknown, R>
}): Predicate<Output, R> => {
  validateName(options.name)
  return { _tag: "Predicate", name: options.name, check: options.check }
}

/** The configured failure mode rejected a proposed completion. */
export class GateFailed extends ActionableTaggedError<GateFailed>()("generalist/core/GateFailed", {
  gate: Result,
  hint: errorHint("Inspect the gate evidence, correct the proposed output or its environment, and run again."),
}) {}

/** @internal Validate Agent-owned gate configuration while the Agent is constructed. */
export const validateAgentGates = (input: {
  readonly gates: ReadonlyArray<{ readonly _tag: string; readonly name: string }>
  readonly sandbox: SandboxService | undefined
  readonly failureMode: FailureMode
}): void => {
  if (input.failureMode !== "retry" && input.failureMode !== "fail") throw new TypeError("Invalid onGateFailure value")
  const names = new Set<string>()
  for (const gate of input.gates) {
    validateName(gate.name)
    if (names.has(gate.name)) throw new TypeError(`Duplicate gate name: ${gate.name}`)
    names.add(gate.name)
  }
  if (!input.gates.some((gate) => gate._tag === "Command")) return
  if (input.sandbox === undefined) throw new TypeError("Agent command gates require a Sandbox")
  if (!input.sandbox.capabilities.commands.includes("Process")) {
    throw new TypeError("Agent command gates require a Sandbox with the Process capability")
  }
}

/** @internal One keyed result retained in the durable loop checkpoint. */
export const Checkpoint = Schema.Struct({ key: Schema.String, turn: Schema.Finite, result: Result })
export type Checkpoint = typeof Checkpoint.Type

/** Verifier Agent shape retained after type erasure. */
export type VerifierAgent<R> = Agent<Record<string, Tool.Any>, R, R, R, Schema.Top, Schema.Top>
