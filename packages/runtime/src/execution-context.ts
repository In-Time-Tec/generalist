import { Context, Effect, Layer, Option, type Scope } from "effect"
import type { Tool } from "effect/unstable/ai"
import { Agent, ToolExecutor } from "@batonfx/core"
import { ChildRuns, make as makeChildRuns } from "./child-runs.js"
import { makeExecutor as makeCodeModeExecutor, type Interface as CodeMode } from "./code-mode.js"
import type { Interface as RunStoreInterface } from "./run-store.js"

/**
 * @experimental Build the Run-scoped context that hosts one resolved Agent. The resolver environment is built once
 * for the Run, Code Mode replaces the resolved tool executor, and the resolved executor stays its upstream.
 */
export const hostContext = <Tools extends Record<string, Tool.Any>, R>(options: {
  readonly agent: Agent.Agent<Tools, R>
  readonly environment: Layer.Layer<Agent.ClosedServices<Tools, R>>
  readonly store: RunStoreInterface
  readonly codeMode: CodeMode | undefined
}): Effect.Effect<
  | Context.Context<Agent.ClosedServices<Tools, R> | ChildRuns>
  | Context.Context<Agent.ClosedServices<Tools, R> | ChildRuns | ToolExecutor.ToolExecutor>,
  never,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const services = yield* Layer.build(options.environment)
    const ambient = yield* Effect.serviceOption(ToolExecutor.ToolExecutor)
    const resolved = Context.getOption(services, ToolExecutor.ToolExecutor)
    const hosted = Context.merge(services, Context.make(ChildRuns, makeChildRuns(options.store)))
    if (options.codeMode === undefined) return hosted
    return Context.merge(
      hosted,
      Context.make(
        ToolExecutor.ToolExecutor,
        makeCodeModeExecutor({
          agent: options.agent,
          environment: options.environment,
          implementation: options.codeMode,
          upstream: Option.isSome(resolved) ? resolved : ambient,
        }),
      ),
    )
  })
