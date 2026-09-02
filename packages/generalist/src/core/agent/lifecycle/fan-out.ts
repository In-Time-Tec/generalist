import { Context, Effect, Exit, Function, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { AgentError } from "../event.js"
import type { RunError } from "../run/error.js"
import type { Agent, Any as AnyAgent, ExecutionServices, Input, Output } from "./definition.js"
import type { BudgetLimits } from "../../durable/run-budget.js"

/** One typed Agent invocation admitted into a process-local fan-out. */
export interface Child<A extends AnyAgent = AnyAgent> {
  readonly agent: A
  readonly input: Input<A>
}

/** Process-local fan-out policy. */
export interface Options {
  readonly concurrency: number
  readonly onFailure: "collect" | "failFast"
}

/** One Exit for each child, preserving tuple order and each Agent's output type. */
export type Results<Children extends ReadonlyArray<Child>> = {
  readonly [Index in keyof Children]: Children[Index] extends Child<infer A> ? Exit.Exit<Output<A>, RunError> : never
}

/** Services required by every member of one typed fan-out. */
export type Requirements<Children extends ReadonlyArray<Child>> = ExecutionServices<Children[number]["agent"]>

/** Public process-local Agent.fanOut call signature. */
export interface FanOut {
  <Children extends ReadonlyArray<Child>>(
    options: Options,
  ): (children: Children) => Effect.Effect<Results<Children>, RunError, Requirements<Children>>
  <Children extends ReadonlyArray<Child>>(
    children: Children,
    options: Options,
  ): Effect.Effect<Results<Children>, RunError, Requirements<Children>>
}

/** One process-local child whose specific Agent type is hidden. */
export type AnyChild = Child<AnyAgent>

type BoundaryValue = typeof Schema.Unknown.Type
type ErasedAgent = Agent<Record<string, Tool.Any>, unknown, unknown, unknown, Schema.Top, Schema.Top>

/** @internal Recursive Agent.run implementation supplied without importing the service module back into this lifecycle owner. */
export interface AgentRunner {
  readonly run: (
    agent: ErasedAgent,
    input: BoundaryValue,
    budget?: BudgetLimits,
  ) => Effect.Effect<BoundaryValue, RunError>
}

/** Process-local child runner supplied by Agent.run and absent under a hosted Runtime. */
export interface ProcessRunnerService {
  readonly run: (child: AnyChild, budget?: BudgetLimits) => Effect.Effect<BoundaryValue, RunError>
}

/** @internal Optional recursive Agent.run capability for model-authored process-local fan-out. */
export class ProcessRunner extends Context.Service<ProcessRunner, ProcessRunnerService>()(
  "generalist/core/agent/lifecycle/fan-out/ProcessRunner",
) {}

const executeChild = (runner: AgentRunner, invocation: AnyChild, budget?: BudgetLimits) => {
  const hiddenAgent: unknown = invocation.agent
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: Agent.child accepts only Agent definitions and preserves the paired input before existential erasure.
  return runner.run(hiddenAgent as ErasedAgent, invocation.input, budget)
}

/** @internal Close a recursive runner over the caller's exact process-local Agent environment. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal constructor with two required direct-style arguments.
export const processRunner = <R>(context: Context.Context<R>, runner: AgentRunner): ProcessRunnerService => {
  const erased = Context.makeUnsafe<unknown>(context.mapUnsafe)
  return ProcessRunner.of({
    run: (invocation, budget) => executeChild(runner, invocation, budget).pipe(Effect.provideContext(erased)),
  })
}

/** Construct one lazy typed child invocation. */
export const child: {
  <A extends AnyAgent>(input: Input<A>): (agent: A) => Child<A>
  <A extends AnyAgent>(agent: A, input: Input<A>): Child<A>
} = Function.dual(2, <A extends AnyAgent>(agent: A, input: Input<A>): Child<A> => ({ agent, input }))

/** @internal Execute one fan-out through the caller-owned Agent runner. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal adapter with three required direct-style arguments.
export const run = <Children extends ReadonlyArray<Child>, R>(
  children: Children,
  options: Options,
  execute: (child: Children[number]) => Effect.Effect<unknown, RunError, R>,
): Effect.Effect<Results<Children>, RunError, R> => {
  if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1) {
    return AgentError.make({
      message: "Agent.fanOut concurrency must be a positive safe integer",
      turn: 0,
    })
  }
  if (options.onFailure === "collect") {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- SAFETY: forEach preserves input order and Effect.exit preserves each tuple member's output in the corresponding Exit.
    return Effect.forEach(children, (invocation) => Effect.exit(execute(invocation)), {
      concurrency: options.concurrency,
    }) as Effect.Effect<Results<Children>, RunError, R>
  }
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- SAFETY: forEach preserves input order; all successful outputs are wrapped at their corresponding tuple indices.
  return Effect.forEach(children, execute, { concurrency: options.concurrency }).pipe(
    Effect.map((outputs) => outputs.map(Exit.succeed)),
  ) as Effect.Effect<Results<Children>, RunError, R>
}

/** @internal Bind the public Agent.fanOut signature to Agent.run without a service-module cycle. */
export const make = (runner: AgentRunner): FanOut =>
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, effecttsgo/unsafe-effect-type-assertion, typescript/no-unsafe-type-assertion -- SAFETY: executeChild erases only scheduling internals; Child preserves each concrete output and requirement in the public mapped signature.
  Function.dual(2, (children: ReadonlyArray<Child>, options: Options) =>
    run(children, options, (invocation) => executeChild(runner, invocation)),
  ) as FanOut
