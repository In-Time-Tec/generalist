import { Clock, Effect, Layer, Option, Schema } from "effect"
import { ToolContext } from "../../core/tools/tool-context.js"
import { CancellationFailure, type CancellationRequest, ToolExecutor } from "../../core/tools/tool-executor.js"
import { decodeCancellableOperation, supportsCancellation } from "../../core/tools/tool-executor-cancellation.js"
import { AgentExecutionFailure, type UnknownAgent } from "../errors.js"
import { selectToolExecutor } from "../execution/context.js"
import { ExecutionResolution, type Resolver } from "../execution/resolution/resolve.js"
import type { ExecutionClaim, ExecutionRecord, Service as RunStore, WorkerMutationError } from "../run/store.js"

const CancellationEnvelope = Schema.Struct({ cancellation: Schema.Unknown })

export const make = (options: {
  readonly store: RunStore
  readonly resolver: Resolver
  readonly suspendUnknown: (claim: ExecutionClaim, error: UnknownAgent) => Effect.Effect<void, WorkerMutationError>
}) =>
  Effect.gen(function* () {
    const ambient = yield* Effect.serviceOption(ToolExecutor)
    return (claim: ExecutionClaim, claimed: ExecutionRecord) =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* options.store.recoverRunningOperations(claim)
          const operations = yield* options.store.operationCancellations(claim)
          if (operations.length > 0) {
            const resolution = yield* ExecutionResolution.resolve(
              options.resolver,
              claimed,
              (error) => options.store.fail({ ...claim, error }),
              (error) => options.suspendUnknown(claim, error),
            )
            if (resolution === undefined) return
            if (resolution._tag !== "Agent") {
              return yield* Effect.die(new Error(`Program Run ${claim.runId} has cancellable tool operations`))
            }
            yield* resolution.agent.open((_agent, environment) =>
              Effect.gen(function* () {
                const services = yield* Layer.build(environment)
                const selected = selectToolExecutor(services, ambient)
                if (Option.isNone(selected)) {
                  return yield* CancellationFailure.make({
                    tool: "unknown",
                    message: `Run ${claim.runId} has no ToolExecutor for durable cancellation`,
                  })
                }
                const executor = selected.value
                for (const operation of operations) {
                  const envelope = Schema.decodeUnknownOption(CancellationEnvelope)(operation.input)
                  const execution = Option.isSome(envelope)
                    ? decodeCancellableOperation(envelope.value.cancellation)
                    : undefined
                  if (execution === undefined) {
                    return yield* CancellationFailure.make({
                      tool: "unknown",
                      message: `Operation ${operation.operationId} has invalid cancellation identity`,
                    })
                  }
                  if (!supportsCancellation(executor, execution)) {
                    return yield* CancellationFailure.make({
                      tool: execution.call.name,
                      message: `ToolExecutor route for ${execution.call.name} no longer supports cancellation`,
                    })
                  }
                  const request: CancellationRequest = {
                    operationKey: operation.operationKey,
                    attempt: operation.attempt,
                    sessionId: claimed.message.sessionId,
                    runId: claimed.runId,
                    rootRunId: claimed.rootRunId,
                    toolCallId: execution.call.id,
                    toolName: execution.call.name,
                    execution,
                  }
                  const outcome = yield* Effect.gen(function* () {
                    const span = yield* Effect.option(Effect.currentSpan)
                    if (Option.isSome(span)) {
                      span.value.event("generalist.runtime.semantic_cancel.delivered", yield* Clock.currentTimeNanos)
                    }
                    const signal = yield* Effect.abortSignal
                    const acknowledged = yield* executor.cancel!(request).pipe(
                      Effect.provideService(
                        ToolContext,
                        ToolContext.of({
                          signal,
                          emit: () => Effect.succeed(true),
                          sessionId: request.sessionId,
                          runId: request.runId,
                          rootRunId: request.rootRunId,
                          toolCallId: request.toolCallId,
                          operationKey: request.operationKey,
                          idempotencyKey: request.operationKey,
                          attempt: request.attempt,
                          admittedAt: claimed.admittedAt,
                        }),
                      ),
                    )
                    if (Option.isSome(span)) {
                      span.value.event(
                        "generalist.runtime.semantic_cancel.acknowledged",
                        yield* Clock.currentTimeNanos,
                        {
                          "generalist.runtime.semantic_cancel.outcome": acknowledged._tag,
                        },
                      )
                    }
                    return acknowledged
                  }).pipe(
                    Effect.withSpan("Generalist.Runtime.semanticCancel", {
                      attributes: {
                        "generalist.runtime.run_id": request.runId,
                        "generalist.runtime.operation_key": request.operationKey,
                        "generalist.runtime.tool_call_id": request.toolCallId,
                      },
                    }),
                  )
                  yield* options.store.acknowledgeOperationCancellation({
                    ...claim,
                    operationId: operation.operationId,
                    outcome,
                  })
                }
              }),
            )
          }
          yield* options.store.fail({
            ...claim,
            error: AgentExecutionFailure.make({ message: "execution cancelled" }),
          })
        }),
      )
  })
