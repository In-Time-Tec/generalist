import { Context, Effect, Function, Layer, Option, type Scope } from "effect"
import type { Tool } from "effect/unstable/ai"
import type { Agent, ClosedServices } from "../../core/agent/service.js"
import { Operations as OperationsService } from "../../core/tools/nested-operation.js"
import { type SessionStore as SessionService, SessionDirectory, SessionStoreError } from "../../core/context/session.js"
import { type Service as ToolExecutorService, ToolExecutor } from "../../core/tools/tool-executor.js"
import { ChildRuns, Executor as ChildRunsExecutor, make as makeChildRuns } from "../child/runs.js"
import { Executor as CodeModeExecutor, type Service as CodeModeService } from "../code-mode.js"
import type { Service as Operations } from "../operation/nested-operations.js"
import type { Service as RunStoreService } from "../run/store.js"
import { AgentMessaging } from "../messaging/service.js"

/** Select the resolved executable's ToolExecutor before the ambient host executor. */
export const selectToolExecutor: {
  (ambient: Option.Option<ToolExecutorService>): <R>(services: Context.Context<R>) => Option.Option<ToolExecutorService>
  <R>(services: Context.Context<R>, ambient: Option.Option<ToolExecutorService>): Option.Option<ToolExecutorService>
} = Function.dual(2, <R>(services: Context.Context<R>, ambient: Option.Option<ToolExecutorService>) => {
  const resolved = Context.getOption(services, ToolExecutor)
  return Option.isSome(resolved) ? resolved : ambient
})

/**
 * Build the Run-scoped context that hosts one resolved Agent. The resolver environment is built once
 * for the Run, Runtime child tools wrap Code Mode and the resolved executor without replacing either.
 */
export const hostContext = <
  Tools extends Record<string, Tool.Any>,
  R,
  InputSchema extends import("effect").Schema.Top,
  OutputSchema extends import("effect").Schema.Top,
>(options: {
  readonly agent: Agent<Tools, R, R, R, InputSchema, OutputSchema>
  readonly environment: Layer.Layer<ClosedServices<Tools, R, InputSchema, OutputSchema>>
  readonly store: RunStoreService
  readonly codeMode: CodeModeService | undefined
  readonly nested: Operations
  readonly messaging: AgentMessaging["Service"]
}): Effect.Effect<
  | Context.Context<
      ClosedServices<Tools, R, InputSchema, OutputSchema> | ChildRuns | OperationsService | AgentMessaging
    >
  | Context.Context<
      | ClosedServices<Tools, R, InputSchema, OutputSchema>
      | ChildRuns
      | OperationsService
      | ToolExecutor
      | AgentMessaging
    >,
  never,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const services = yield* Layer.build(options.environment).pipe(
      Effect.provideService(AgentMessaging, options.messaging),
    )
    const ambient = yield* Effect.serviceOption(ToolExecutor)
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
      Context.add(services, AgentMessaging, options.messaging),
      Context.merge(
        Context.merge(
          Context.make(ChildRuns, children),
          Context.make(OperationsService, OperationsService.of(options.nested)),
        ),
        Context.make(
          ToolExecutor,
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

/** Bind one hosted Run to exactly one durable Session store. */
export const sessionBinding = (input: {
  readonly store: RunStoreService
  readonly claim: import("../run/store.js").ExecutionClaim
}): Effect.Effect<{
  readonly session: Option.Option<SessionService>
  readonly context: Context.Context<SessionDirectory>
}> =>
  input.store.claimedSessionStore(input.claim).pipe(
    Effect.map((session) => ({
      session,
      context: Context.make(
        SessionDirectory,
        SessionDirectory.of({
          acquire: (sessionId) =>
            sessionId !== input.claim.session.sessionId
              ? Effect.fail(
                  SessionStoreError.make({
                    message: `Hosted Run Session ${input.claim.session.sessionId} cannot acquire Session ${sessionId}`,
                  }),
                )
              : Option.match(session, {
                  onNone: () =>
                    Effect.fail(
                      SessionStoreError.make({
                        message: `Runtime store does not provide Session ${input.claim.session.sessionId}`,
                      }),
                    ),
                  onSome: Effect.succeed,
                }),
        }),
      ),
    })),
  )
