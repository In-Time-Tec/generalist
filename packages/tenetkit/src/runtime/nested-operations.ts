import { Cause, Effect, Option, Ref } from "effect"
import { Response } from "effect/unstable/ai"
import { Approvals, NestedOperation, ToolContext } from "tenetkit"
import type { AgentEvent } from "tenetkit"
import type { ExecutionClaim, ExecutionRecord, Interface as RunStoreInterface } from "./run-store.js"
import type { WaitReason } from "./run-wait.js"
import { approvalReason } from "./run-wait.js"

/** @experimental The persisted operation kind every nested host operation uses. */
export const nestedOperationKind = "nested" as const

interface PendingApproval {
  readonly approvalId: string
  readonly operation: string
  readonly capability: string
  readonly input: unknown
}

/** @experimental Runtime-owned nested durable operations plus the waits they open. */
export interface Interface extends NestedOperation.Interface {
  readonly waitFor: (
    suspension: AgentEvent.AgentSuspended,
  ) => Effect.Effect<{ readonly waitId: string; readonly reason: WaitReason } | undefined>
}

/** @experimental Persisted identity of one nested operation beneath an outer durable operation. */
export const nestedOperationKey = (input: { readonly operationKey: string; readonly ordinal: number }): string =>
  `${input.operationKey}#${input.ordinal}`

/** @experimental Stable approval identity for one nested operation. */
export const nestedApprovalId = (nestedKey: string): string => `nested-approval:${nestedKey}`

interface NestedInput {
  readonly kind: string
  readonly ordinal: number
  readonly payload: unknown
}

const recordedInput = (value: unknown): NestedInput | undefined =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  typeof value.kind === "string" &&
  "ordinal" in value &&
  typeof value.ordinal === "number"
    ? (value as NestedInput)
    : undefined

const errorFromCause = <E>(cause: Cause.Cause<E>): { readonly _tag: "Failed"; readonly error: E } | undefined => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return reason !== undefined && Cause.isFailReason(reason) ? { _tag: "Failed", error: reason.error } : undefined
}

/**
 * @experimental Construct the Run-attempt scoped nested-operation executor.
 *
 * A composite tool call crosses many authoritative boundaries. Each crossing is persisted under the
 * outer operation's identity plus a host-assigned ordinal before the handler runs, so a duplicate
 * identity returns the recorded outcome, a divergent payload fails typed, and an outcome that was
 * never observed parks for explicit resolution instead of silently repeating a side effect.
 */
export const make = (input: {
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly store: RunStoreInterface
}): Effect.Effect<Interface> =>
  Effect.gen(function* () {
    const ordinals = yield* Ref.make(new Map<string, number>())
    const pending = yield* Ref.make(new Map<string, PendingApproval>())

    const nextOrdinal = (operationKey: string) =>
      Ref.modify(ordinals, (current) => {
        const ordinal = current.get(operationKey) ?? 0
        const next = new Map(current)
        next.set(operationKey, ordinal + 1)
        return [ordinal, next] as const
      })

    const resolvedApproval = (approvalId: string) =>
      input.claimed.suspension?.token === approvalId ? input.claimed.resolution : undefined

    const run = <A, E, R>(
      request: NestedOperation.Request<A>,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | NestedOperation.Failure, R | ToolContext.ToolContext> =>
      Effect.gen(function* () {
        const context = yield* ToolContext.ToolContext
        const operationKey = context.operationKey ?? context.toolCallId ?? input.claim.runId
        const ordinal = yield* nextOrdinal(operationKey)
        const nestedKey = nestedOperationKey({ operationKey, ordinal })
        const payloadDigest = NestedOperation.payloadDigest(request.kind, request.payload)
        const toolCallId = context.toolCallId
        const projected = (value: A) => (request.render === undefined ? undefined : request.render(value))
        const emit = (status: NestedOperation.ProgressStatus, render?: NestedOperation.Render) =>
          toolCallId === undefined
            ? Effect.void
            : NestedOperation.progressData({ kind: request.kind, ordinal, status, render }).pipe(
                Effect.flatMap((data) => context.emit({ toolCallId, message: `${request.kind} ${status}`, data })),
              )

        const record = yield* input.store
          .recordOperation({
            ...input.claim,
            operationKey: nestedKey,
            kind: nestedOperationKind,
            inputDigest: payloadDigest,
            input: { kind: request.kind, ordinal, payload: request.payload } satisfies NestedInput,
            replayPolicy: request.replayPolicy,
            attempt: input.claimed.attempt,
          })
          .pipe(Effect.orDie)
        const persisted = recordedInput(record.input)
        if (record.inputDigest !== payloadDigest || persisted?.kind !== request.kind) {
          return yield* NestedOperation.NestedOperationDivergence.make({
            operationKey,
            ordinal,
            recordedKind: persisted?.kind ?? record.kind,
            recordedDigest: record.inputDigest,
            requestedKind: request.kind,
            requestedDigest: payloadDigest,
          })
        }
        if (record.status === "succeeded") {
          const value = record.result as A
          yield* emit("succeeded", projected(value))
          return value
        }
        if (record.status === "failed") {
          yield* emit("failed")
          return yield* Effect.fail(record.error as E)
        }
        const unknown = () =>
          NestedOperation.NestedOperationUnknown.make({ operationKey, ordinal, operationId: record.operationId })
        if (record.status === "unknown") return yield* unknown()
        if (record.status === "running") {
          const expired = yield* input.store
            .expireRunningOperation({ ...input.claim, operationId: record.operationId })
            .pipe(Effect.orDie)
          if (expired.outcome === "unknown") return yield* unknown()
          if (expired.outcome === "succeeded") return expired.record.result as A
          if (expired.outcome === "failed") return yield* Effect.fail(expired.record.error as E)
        }

        const settle = (
          outcome:
            | { readonly _tag: "Succeeded"; readonly value: unknown }
            | { readonly _tag: "Failed"; readonly error: unknown }
            | { readonly _tag: "Unknown" },
        ) =>
          input.store
            .completeOperation({ ...input.claim, operationId: record.operationId, outcome })
            .pipe(
              Effect.orDie,
              Effect.andThen(
                outcome._tag === "Succeeded"
                  ? emit("succeeded", projected(outcome.value as A))
                  : outcome._tag === "Failed"
                    ? emit("failed")
                    : emit("unknown"),
              ),
            )

        if (request.approval !== undefined) {
          const capability = request.approval.capability
          const approvalId = nestedApprovalId(nestedKey)
          const prior = resolvedApproval(approvalId)
          const denied = (reason: string) =>
            Effect.gen(function* () {
              const failure = NestedOperation.NestedOperationDenied.make({
                operationKey,
                ordinal,
                capability,
                reason,
              })
              yield* settle({ _tag: "Failed", error: failure })
              return yield* failure
            })
          if (prior === undefined) {
            const approvals = yield* Effect.serviceOption(Approvals.Approvals)
            const resolution = yield* Option.getOrElse(approvals, () => autoApprove).resolve({
              _tag: "Pending",
              token: approvalId,
              call: Response.makePart("tool-call", {
                id: approvalId,
                name: capability,
                params: request.approval.request ?? request.payload,
                providerExecuted: false,
              }),
              agentName: capability,
              turn: 0,
              sessionId: context.sessionId,
            })
            if (resolution._tag === "Denied") return yield* denied(resolution.reason ?? "nested operation denied")
            if (resolution._tag === "Pending") {
              yield* Ref.update(pending, (current) => {
                const next = new Map(current)
                next.set(approvalId, {
                  approvalId,
                  operation: nestedKey,
                  capability,
                  input: request.approval?.request ?? request.payload,
                })
                return next
              })
              return yield* NestedOperation.NestedOperationSuspended.make({
                token: approvalId,
                operationKey,
                ordinal,
                capability,
              })
            }
          } else if (prior._tag === "Denied") {
            return yield* denied(prior.reason ?? "nested operation denied")
          } else if (prior._tag !== "Approved") {
            return yield* denied("nested operation approval resolved with an unexpected decision")
          }
        }

        yield* input.store.startOperation({ ...input.claim, operationId: record.operationId }).pipe(Effect.orDie)
        yield* emit("running")
        const exit = yield* Effect.exit(effect)
        if (exit._tag === "Success") {
          yield* settle({ _tag: "Succeeded", value: exit.value })
          return exit.value
        }
        const failed = errorFromCause(exit.cause)
        if (failed !== undefined) {
          yield* settle({ _tag: "Failed", error: failed.error })
          return yield* Effect.failCause(exit.cause)
        }
        if (request.replayPolicy === "never") {
          yield* Effect.uninterruptible(settle({ _tag: "Unknown" }))
        }
        return yield* Effect.failCause(exit.cause)
      })

    const waitFor: Interface["waitFor"] = (suspension) =>
      Ref.get(pending).pipe(
        Effect.map((current) => {
          const approval = current.get(suspension.token)
          if (approval === undefined) return undefined
          return {
            waitId: approval.approvalId,
            reason: approvalReason({
              approvalId: approval.approvalId,
              operation: approval.operation,
              capability: approval.capability,
              input: approval.input,
            }),
          }
        }),
      )

    return { run, waitFor }
  })

const autoApprove: Approvals.Interface = { resolve: () => Effect.succeed({ _tag: "Approved" as const }) }
