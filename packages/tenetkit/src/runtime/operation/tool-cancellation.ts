import { Effect, Layer, Option, Schema } from "effect"
import { ToolContext } from "../../core/index.js"
import { ToolExecutor } from "../../core/tools/public/tool-executor.js"
import { decodeCancellableOperation, supportsCancellation } from "../../core/tools/tool-executor-cancellation.js"
import { AgentExecutionFailure } from "../errors.js"
import type { Interface as ExecutableResolver } from "../executable/resolver.js"
import { selectToolExecutor } from "../execution/context.js"
import { ExecutionResolution } from "../execution/resolution.js"
import type { ExecutionClaim, ExecutionRecord, Interface as RunStore } from "../run/store.js"

const CancellationEnvelope = Schema.Struct({ cancellation: Schema.Unknown })

export const make = (options: { readonly store: RunStore; readonly resolver: ExecutableResolver }) =>
  Effect.gen(function* () {
    const ambient = yield* Effect.serviceOption(ToolExecutor.ToolExecutor)
    return (claim: ExecutionClaim, claimed: ExecutionRecord) =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* options.store.recoverRunningOperations(claim)
          const operations = yield* options.store.operationCancellations(claim)
          if (operations.length > 0) {
            const resolution = yield* ExecutionResolution.resolve(options.resolver, claimed, (error) =>
              options.store.fail({ ...claim, error }),
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
                  return yield* ToolExecutor.CancellationFailure.make({
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
                    return yield* ToolExecutor.CancellationFailure.make({
                      tool: "unknown",
                      message: `Operation ${operation.operationId} has invalid cancellation identity`,
                    })
                  }
                  if (!supportsCancellation(executor, execution)) {
                    return yield* ToolExecutor.CancellationFailure.make({
                      tool: execution.call.name,
                      message: `ToolExecutor route for ${execution.call.name} no longer supports cancellation`,
                    })
                  }
                  const request: ToolExecutor.CancellationRequest = {
                    operationKey: operation.operationKey,
                    attempt: operation.attempt,
                    sessionId: claimed.message.sessionId,
                    runId: claimed.runId,
                    rootRunId: claimed.rootRunId,
                    toolCallId: execution.call.id,
                    toolName: execution.call.name,
                    execution,
                  }
                  const signal = yield* Effect.abortSignal
                  const outcome = yield* executor.cancel!(request).pipe(
                    Effect.provideService(
                      ToolContext.ToolContext,
                      ToolContext.ToolContext.of({
                        signal,
                        emit: () => Effect.void,
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
