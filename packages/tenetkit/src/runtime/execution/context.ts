import { Context, Effect, Function, Layer, Option, type Scope } from "effect"
import type { Tool } from "effect/unstable/ai"
import { Agent } from "../../core/index.js"
import { NestedOperation } from "../../core/tools/public/nested-operation.js"
import { Session } from "../../core/context/public/session.js"
import { ToolExecutor } from "../../core/tools/public/tool-executor.js"
import { ChildRuns, Executor as ChildRunsExecutor, make as makeChildRuns } from "../child/runs.js"
import { Executor as CodeModeExecutor, type Service as CodeModeService } from "../code-mode.js"
import type { Service as NestedOperations } from "../operation/nested-operations.js"
import type { Service as RunStoreService } from "../run/store.js"

/** @experimental Select the resolved executable's ToolExecutor before the ambient host executor. */
export const selectToolExecutor: {
  (
    ambient: Option.Option<ToolExecutor.Service>,
  ): <R>(services: Context.Context<R>) => Option.Option<ToolExecutor.Service>
  <R>(services: Context.Context<R>, ambient: Option.Option<ToolExecutor.Service>): Option.Option<ToolExecutor.Service>
} = Function.dual(2, <R>(services: Context.Context<R>, ambient: Option.Option<ToolExecutor.Service>) => {
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
  readonly store: RunStoreService
  readonly codeMode: CodeModeService | undefined
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

/** @experimental Bind one hosted Run to exactly one durable Session store. */
export const sessionBinding = (input: {
  readonly store: RunStoreService
  readonly claim: import("../run/store.js").ExecutionClaim
}): Effect.Effect<{
  readonly session: Option.Option<Session.Service>
  readonly context: Context.Context<Session.SessionDirectory>
}> =>
  input.store.claimedSessionStore(input.claim).pipe(
    Effect.map((session) => ({
      session,
      context: Context.make(
        Session.SessionDirectory,
        Session.SessionDirectory.of({
          acquire: (sessionId) =>
            sessionId !== input.claim.session.sessionId
              ? Effect.fail(
                  Session.SessionStoreError.make({
                    message: `Hosted Run Session ${input.claim.session.sessionId} cannot acquire Session ${sessionId}`,
                  }),
                )
              : Option.match(session, {
                  onNone: () =>
                    Effect.fail(
                      Session.SessionStoreError.make({
                        message: `Runtime store does not provide Session ${input.claim.session.sessionId}`,
                      }),
                    ),
                  onSome: Effect.succeed,
                }),
        }),
      ),
    })),
  )
