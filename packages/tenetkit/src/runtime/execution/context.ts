import { Context, Effect, Function, Layer, Option, type Scope } from "effect"
import type { Tool } from "effect/unstable/ai"
import { Agent } from "../../core/index.js"
import { NestedOperation } from "../../core/tools/public/nested-operation.js"
import { Session } from "../../core/context/public/session.js"
import { ToolExecutor } from "../../core/tools/public/tool-executor.js"
import { ChildRuns, Executor as ChildRunsExecutor, make as makeChildRuns } from "../child/runs.js"
import { Executor as CodeModeExecutor, type Interface as CodeModeInterface } from "../code-mode.js"
import type { Interface as NestedOperations } from "../operation/nested-operations.js"
import type { Interface as RunStoreInterface } from "../run/store.js"

/** @experimental Select the resolved executable's ToolExecutor before the ambient host executor. */
export const selectToolExecutor: {
  (
    ambient: Option.Option<ToolExecutor.Interface>,
  ): <R>(services: Context.Context<R>) => Option.Option<ToolExecutor.Interface>
  <R>(
    services: Context.Context<R>,
    ambient: Option.Option<ToolExecutor.Interface>,
  ): Option.Option<ToolExecutor.Interface>
} = Function.dual(2, <R>(services: Context.Context<R>, ambient: Option.Option<ToolExecutor.Interface>) => {
  const resolved = Context.getOption(services, ToolExecutor.ToolExecutor)
  return Option.isSome(resolved) ? resolved : ambient
})

/**
 * @experimental Build the Run-scoped context that hosts one resolved Agent. The resolver environment is built once
 * for the Run, Runtime child tools wrap Code Mode and the resolved executor without replacing either.
 */
export const hostContext = <Tools extends Record<string, Tool.Any>, R>(options: {
  readonly agent: Agent.Agent<Tools, R>
  readonly environment: Layer.Layer<Agent.ClosedServices<Tools, R>>
  readonly store: RunStoreInterface
  readonly codeMode: CodeModeInterface | undefined
  readonly nested: NestedOperations
}): Effect.Effect<
  | Context.Context<Agent.ClosedServices<Tools, R> | ChildRuns | NestedOperation.NestedOperations>
  | Context.Context<
      Agent.ClosedServices<Tools, R> | ChildRuns | NestedOperation.NestedOperations | ToolExecutor.ToolExecutor
    >,
  never,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const services = yield* Layer.build(options.environment)
    const ambient = yield* Effect.serviceOption(ToolExecutor.ToolExecutor)
    const children = makeChildRuns(options.store)
    const resolvedOrAmbient = selectToolExecutor(services, ambient)
    const upstream =
      options.codeMode === undefined
        ? resolvedOrAmbient
        : Option.some(
            CodeModeExecutor.make({
              agent: options.agent,
              environment: options.environment,
              implementation: options.codeMode,
              upstream: resolvedOrAmbient,
            }),
          )
    return Context.merge(
      services,
      Context.merge(
        Context.merge(
          Context.make(ChildRuns, children),
          Context.make(NestedOperation.NestedOperations, NestedOperation.NestedOperations.of(options.nested)),
        ),
        Context.make(
          ToolExecutor.ToolExecutor,
          ChildRunsExecutor.make({
            agent: options.agent,
            environment: options.environment,
            implementation: children,
            upstream,
          }),
        ),
      ),
    )
  })

/**
 * @experimental Bind one Run to the durable conversation for its session identity.
 *
 * Session owns model-facing history, so a durable store hands each Run its session and a Run
 * continues the conversation instead of starting empty. A store without durable Session returns
 * undefined and the Run falls back to whatever Session its environment provides.
 */
export const sessionContext = (input: {
  readonly store: RunStoreInterface
  readonly sessionId: string
}): Effect.Effect<Context.Context<never> | Context.Context<Session.SessionStore>> =>
  input.store.sessionStore(input.sessionId).pipe(
    Effect.map(
      Option.match({
        onNone: () => Context.empty(),
        onSome: (session) => Context.make(Session.SessionStore, session),
      }),
    ),
  )
