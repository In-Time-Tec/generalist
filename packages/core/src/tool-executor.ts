import { Cause, Context, Effect, Layer, Option, Sink, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import * as AgentEvent from "./agent-event"
import * as ToolContext from "./tool-context"

/** @experimental A single tool-call execution request. */
export interface Request {
  readonly call: Ai.Response.ToolCallPart<string, unknown>
  readonly turn: number
  readonly agentName: string
  readonly sessionId: string
}

/** @experimental Tool ran; `result`/`encodedResult` feed the tool-result part. */
export interface Success {
  readonly _tag: "Success"
  readonly result: unknown
  readonly encodedResult: unknown
}

/** @experimental Tool failed; the model sees a failed tool result and may react. */
export interface Failure {
  readonly _tag: "Failure"
  readonly message: string
}

/** @experimental The host will resolve this out-of-band; suspends the run. */
export interface Suspend {
  readonly _tag: "Suspend"
  readonly token: string
}

/** @experimental */
export type Outcome = Success | Failure | Suspend

/** @experimental */
export interface Interface {
  readonly execute: (request: Request) => Effect.Effect<Outcome, AgentEvent.AgentError, ToolContext.ToolContext>
}

/** @experimental */
export class ToolExecutor extends Context.Service<ToolExecutor, Interface>()("@batonfx/core/ToolExecutor") {}

const failureMessage = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause)
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

const failureOutcome = (message: string): Outcome => ({ _tag: "Failure", message })

const executeWithToolkit = <Tools extends Record<string, Ai.Tool.Any>>(
  toolkit: Ai.Toolkit.WithHandler<Tools>,
  request: Request,
): Effect.Effect<Outcome> => {
  if (toolkit.tools[request.call.name] === undefined) {
    return Effect.succeed(failureOutcome(`Tool ${request.call.name} is not registered`))
  }
  return toolkit.handle(request.call.name as never, request.call.params as never).pipe(
    Effect.flatMap((results) =>
      (results as Stream.Stream<Ai.Tool.HandlerResult<Ai.Tool.Any>, unknown>).pipe(
        Stream.filter((item) => item.preliminary === false),
        Stream.run(Sink.last()),
      ),
    ),
    Effect.map(
      Option.match({
        onNone: (): Outcome => failureOutcome("Tool handler did not produce a final result"),
        onSome: (result): Outcome => ({
          _tag: "Success",
          result: result.result,
          encodedResult: result.encodedResult,
        }),
      }),
    ),
    Effect.catchCause((cause) => Effect.succeed(failureOutcome(failureMessage(cause)))),
  )
}

/**
 * @experimental Default executor: runs the toolkit's own handlers in-process.
 * `toolkit.handle(name, params)` streams handler results; the last
 * non-preliminary result becomes `Success`; handler failure becomes `Failure`.
 */
export const fromToolkit = <Tools extends Record<string, Ai.Tool.Any>>(
  toolkit: Ai.Toolkit.WithHandler<Tools>,
): Layer.Layer<ToolExecutor> =>
  Layer.succeed(
    ToolExecutor,
    ToolExecutor.of({
      execute: (request) => executeWithToolkit(toolkit, request),
    }),
  )

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<ToolExecutor> =>
  Layer.succeed(ToolExecutor, ToolExecutor.of(implementation))
