import { DateTime, Effect, Ref, Schema, type Scope } from "effect"
import { Response } from "effect/unstable/ai"
import { digest } from "../../../core/durable/canonical-json.js"
import { ToolContext } from "../../../core/tools/tool-context.js"
import { Outcome, type Request } from "../../../core/tools/tool-executor.js"
import { cancellableOperation, supportsCancellation } from "../../../core/tools/tool-executor-cancellation.js"
import { Approvals } from "../../../core/policy/approvals.js"
import { AgentExecutionFailure, RunTerminal } from "../../errors.js"
import type { ToolResolution } from "../../executable/resolver.js"
import { Input } from "../../hosting/tool-start.js"
import type { ExecutionClaim, ExecutionRecord, Service as RunStore } from "../../run/store.js"
import { approvalReason, type WaitReason } from "../../run/wait.js"
import type { Request as ApprovalRequest } from "../../operation/approval.js"
import { ToolSuspended } from "../state.js"

export const executeTool = (input: {
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly store: RunStore
  readonly resolution: ToolResolution
  readonly activeOperationIds: Ref.Ref<ReadonlySet<string>>
}): Effect.Effect<void, never, Scope.Scope> => {
  const { claim, claimed, resolution, store } = input
  const checkpoint = { _tag: "Tool" as const, version: "1" as const }
  const suspend = (token: string, reason: WaitReason) =>
    Effect.gen(function* () {
      yield* store.suspend({
        ...claim,
        checkpoint,
        suspension: ToolSuspended.make({ token }),
        waits: [
          { waitId: token, reason, status: "open", openedAt: yield* DateTime.now.pipe(Effect.map(DateTime.formatIso)) },
        ],
      })
    })
  const execute = Effect.gen(function* () {
    const admission = yield* Schema.decodeUnknownEffect(Input)(claimed.message.metadata.tool)
    const params = yield* Schema.decodeEffect(resolution.input)(admission.input)
    const operationKey = `tool:${claim.runId}:${resolution.pinned.pin}`
    const call = Response.toolCallPart({
      id: operationKey,
      name: resolution.pinned.manifest.name,
      params,
      providerExecuted: false,
    })
    const encodedCall = Response.toolCallPart({ ...call, params: admission.input })
    const request: Request = {
      call: encodedCall,
      toolCallBatch: { calls: [encodedCall] },
      turn: 0,
      toolCallIndex: 0,
      agentName: call.name,
      sessionId: claimed.message.sessionId,
    }
    const cancellation = supportsCancellation(resolution.executor, request)
      ? {
          cancellation: cancellableOperation({
            ...request,
            call: encodedCall,
            toolCallBatch: { calls: [encodedCall] },
          }),
        }
      : {}
    const record = yield* store.recordOperation({
      ...claim,
      operationKey,
      kind: "tool",
      inputDigest: digest(admission.input),
      input: { request: admission.input, ...cancellation },
      replayPolicy: resolution.pinned.manifest.replay,
      attempt: claimed.attempt,
      checkpoint,
    })
    const complete = (outcome: Outcome) =>
      Effect.gen(function* () {
        if (outcome._tag === "Suspend") {
          const resumed = claimed.resolutions.find((entry) => entry.waitId === outcome.token)?.resolution
          if (resumed?._tag !== "ToolResult") {
            return yield* suspend(
              outcome.token,
              outcome.awaitEvent === undefined ? { _tag: "ToolWait" } : { _tag: "AwaitEvent", ...outcome.awaitEvent },
            )
          }
          yield* Schema.decodeEffect(resolution.output)(resumed.encodedResult)
          return yield* store.complete({
            ...claim,
            commandId: `tool-complete:${record.operationId}`,
            result: { _tag: "Tool", isFailure: false, value: resumed.encodedResult },
          })
        }
        const result = {
          _tag: "Tool" as const,
          isFailure: outcome._tag === "DomainFailure",
          value: outcome._tag === "Success" ? outcome.encodedResult : outcome.encodedFailure,
        }
        yield* Schema.decodeEffect(result.isFailure ? resolution.failure : resolution.output)(result.value)
        yield* store.complete({ ...claim, commandId: `tool-complete:${record.operationId}`, result })
      })
    if (record.status === "succeeded")
      return yield* Schema.decodeUnknownEffect(Outcome)(record.result).pipe(Effect.flatMap(complete))
    if (record.status === "failed") return yield* AgentExecutionFailure.make({ message: "Tool operation failed" })
    if (record.status !== "requested") return
    const approval = yield* Ref.make<ApprovalRequest | undefined>(undefined)
    const authorization = yield* resolution
      .authorizer(
        Approvals.of({
          resolve: (pending) => {
            const previous = claimed.resolutions.find((entry) => entry.waitId === pending.token)?.resolution
            return Effect.succeed(previous?._tag === "Approved" || previous?._tag === "Denied" ? previous : pending)
          },
        }),
      )
      .authorize({
        call,
        tool: resolution.tool,
        active: true,
        activeTools: [call.name],
        activatedSkills: [],
        messages: [],
        agentName: call.name,
        turn: 0,
        sessionId: claimed.message.sessionId,
        runId: claim.runId,
        onApprovalRequired: (pending) => Ref.set(approval, pending),
      })
    if (authorization._tag === "Deny") {
      yield* store.completeOperation({
        ...claim,
        operationId: record.operationId,
        outcome: { _tag: "Failed", error: authorization.error },
        checkpoint,
      })
      return yield* AgentExecutionFailure.make({ message: authorization.error.message })
    }
    if (authorization._tag === "Suspend") {
      const pending = yield* Ref.get(approval)
      if (pending === undefined)
        return yield* AgentExecutionFailure.make({ message: "Tool approval did not retain its request" })
      return yield* suspend(authorization.token, approvalReason(pending))
    }
    yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        yield* store.startOperation({
          ...claim,
          operationId: record.operationId,
          commandId: `tool-start:${record.operationId}:${claim.attemptFence}`,
        })
        yield* Ref.update(input.activeOperationIds, (current) => new Set(current).add(record.operationId))
        yield* store.emitAgentEvent({
          ...claim,
          commandId: `tool-event-start:${record.operationId}:${claim.attemptFence}`,
          event: { _tag: "ToolExecutionStarted", turn: 0, call: encodedCall },
        })
        const progressSequence = yield* Ref.make(0)
        const signal = yield* Effect.abortSignal
        const outcome = yield* restore(
          resolution.executor.execute(request).pipe(
            Effect.provideService(ToolContext, {
              signal,
              emit: (progress) =>
                Effect.gen(function* () {
                  const sequence = yield* Ref.updateAndGet(progressSequence, (value) => value + 1)
                  yield* store.emitAgentEvent({
                    ...claim,
                    commandId: `tool-progress:${record.operationId}:${claim.attemptFence}:${sequence}`,
                    event: { ...progress, _tag: "ToolProgress", turn: 0, toolCallId: call.id },
                  })
                  return true
                }).pipe(Effect.orDie),
              sessionId: claimed.message.sessionId,
              runId: claim.runId,
              rootRunId: claimed.rootRunId,
              toolCallId: call.id,
              operationKey,
              idempotencyKey: operationKey,
              attempt: claimed.attempt,
              admittedAt: claimed.admittedAt,
            }),
          ),
        )
        const validated = yield* Schema.decodeEffect(Outcome)(outcome)
        let retained: Outcome = validated
        if (validated._tag === "Success") retained = { ...validated, result: validated.encodedResult }
        if (validated._tag === "DomainFailure") retained = { ...validated, failure: validated.encodedFailure }
        yield* store.completeOperation({
          ...claim,
          operationId: record.operationId,
          outcome: { _tag: "Succeeded", value: retained },
          checkpoint,
        })
        yield* Ref.update(
          input.activeOperationIds,
          (current) => new Set([...current].filter((id) => id !== record.operationId)),
        )
        yield* complete(validated)
      }),
    )
  })
  return execute.pipe(
    Effect.catch((error) =>
      Effect.gen(function* () {
        for (const operationId of yield* Ref.get(input.activeOperationIds)) {
          yield* store.expireRunningOperation({
            ...claim,
            operationId,
            commandId: `tool-expire:${operationId}:${claim.attemptFence}`,
          })
        }
        if ((yield* store.inspect(claim.runId)).status === "needs-resolution") return
        yield* store.fail({ ...claim, error: AgentExecutionFailure.make({ message: String(error) }) })
      }),
    ),
    Effect.catch((error) => (Schema.is(RunTerminal)(error) ? Effect.void : Effect.fail(error))),
    Effect.asVoid,
    Effect.orDie,
  )
}
