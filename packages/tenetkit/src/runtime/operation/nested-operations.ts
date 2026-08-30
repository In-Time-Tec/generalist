import { Cause, Effect, Option, Ref, Schema } from "effect"
import { Response } from "effect/unstable/ai"
import { Approvals, type Service as ApprovalsService } from "../../core/policy/approvals.js"
import {
  type Failure,
  NestedOperationDenied,
  NestedOperationDivergence,
  NestedOperationSuspended,
  NestedOperationUnknown,
  type ProgressStatus,
  type Render,
  type Request,
  type Service as NestedOperationService,
  payloadDigest as nestedOperationPayloadDigest,
  progressData,
} from "../../core/tools/nested-operation.js"
import { ToolContext } from "../../core/tools/tool-context.js"
import type { AgentSuspended } from "../../core/agent/event.js"
import type { ExecutionClaim, ExecutionRecord, Service as RunStoreService } from "../run/store.js"
import { approvalReason, type WaitReason } from "../run/wait.js"

/** @experimental The persisted operation kind every nested host operation uses. */
export const nestedOperationKind = "nested" as const

interface PendingApproval {
  readonly approvalId: string
  readonly operation: string
  readonly capability: string
  readonly input: unknown
}

/** @experimental Runtime-owned nested durable operations plus the waits they open. */
export interface Service extends NestedOperationService {
  readonly waitFor: (
    wait: AgentSuspended["waits"][number],
  ) => Effect.Effect<{ readonly waitId: string; readonly reason: WaitReason } | undefined>
}

/** @experimental Persisted identity of one nested operation beneath an outer durable operation. */
export const nestedOperationKey = (input: { readonly operationKey: string; readonly ordinal: number }): string =>
  `${input.operationKey}#${input.ordinal}`

/** @experimental Stable approval identity for one nested operation. */
export const nestedApprovalId = (nestedKey: string): string => `nested-approval:${nestedKey}`

const NestedInput = Schema.Struct({ kind: Schema.String, ordinal: Schema.Finite, payload: Schema.Unknown })
type NestedInput = typeof NestedInput.Type

const recordedInput = Schema.decodeUnknownOption(NestedInput)

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
  readonly store: RunStoreService
}): Effect.Effect<Service> =>
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
      input.claimed.resolutions.find((entry) => entry.waitId === approvalId)?.resolution

    function run<A, E, R>(
      request: Request<A, E>,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | Failure, R | ToolContext> {
      return Effect.gen(function* () {
        const context = yield* ToolContext
        const operationKey = context.operationKey ?? context.toolCallId ?? input.claim.runId
        const ordinal = yield* nextOrdinal(operationKey)
        const nestedKey = nestedOperationKey({ operationKey, ordinal })
        const payloadDigest = nestedOperationPayloadDigest(request.kind, request.payload)
        const toolCallId = context.toolCallId
        const projected = (value: A) => (request.render === undefined ? undefined : request.render(value))
        const emit = (status: ProgressStatus, render?: Render) =>
          toolCallId === undefined
            ? Effect.void
            : progressData({ kind: request.kind, ordinal, status, render }).pipe(
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
        const unknown = () => NestedOperationUnknown.make({ operationKey, ordinal, operationId: record.operationId })
        const replayFailure = (recorded: { readonly error?: unknown }) => {
          if (request.failure === undefined) return Effect.fail(unknown())
          return Schema.decodeUnknownEffect(request.failure)(recorded.error).pipe(
            Effect.matchEffect({ onFailure: () => Effect.fail(unknown()), onSuccess: Effect.fail }),
          )
        }
        const persisted = Option.getOrUndefined(recordedInput(record.input))
        if (record.inputDigest !== payloadDigest || persisted?.kind !== request.kind) {
          return yield* NestedOperationDivergence.make({
            operationKey,
            ordinal,
            recordedKind: persisted?.kind ?? record.kind,
            recordedDigest: record.inputDigest,
            requestedKind: request.kind,
            requestedDigest: payloadDigest,
          })
        }
        const replay = Effect.gen(function* () {
          if (
            record.status !== "succeeded" &&
            record.status !== "failed" &&
            record.status !== "unknown" &&
            record.status !== "running"
          )
            return Option.none<A>()
          if (record.status === "succeeded") {
            if (request.success === undefined) return yield* unknown()
            const value = yield* Schema.decodeUnknownEffect(request.success)(record.result).pipe(
              Effect.mapError(() => unknown()),
            )
            yield* emit("succeeded", projected(value))
            return Option.some(value)
          }
          if (record.status === "failed") {
            yield* emit("failed")
            return yield* replayFailure(record)
          }
          if (record.status === "unknown") return yield* unknown()
          const expired = yield* input.store
            .expireRunningOperation({ ...input.claim, operationId: record.operationId })
            .pipe(Effect.orDie)
          if (expired.outcome === "unknown") return yield* unknown()
          if (expired.outcome === "failed") return yield* replayFailure(expired.record)
          if (request.success === undefined) return yield* unknown()
          const value = yield* Schema.decodeUnknownEffect(request.success)(expired.record.result).pipe(
            Effect.mapError(() => unknown()),
          )
          return Option.some(value)
        })
        const replayed = yield* replay
        if (Option.isSome(replayed)) return replayed.value

        const progressFor = (
          outcome:
            | { readonly _tag: "Succeeded"; readonly value: A }
            | { readonly _tag: "Failed"; readonly error: unknown }
            | { readonly _tag: "Unknown" },
        ) => {
          if (outcome._tag === "Succeeded") return emit("succeeded", projected(outcome.value))
          if (outcome._tag === "Failed") return emit("failed")
          return emit("unknown")
        }
        const settle = (
          outcome:
            | { readonly _tag: "Succeeded"; readonly value: A }
            | { readonly _tag: "Failed"; readonly error: unknown }
            | { readonly _tag: "Unknown" },
        ) =>
          input.store
            .completeOperation({ ...input.claim, operationId: record.operationId, outcome })
            .pipe(Effect.orDie, Effect.andThen(progressFor(outcome)))

        if (request.approval !== undefined) {
          const approval = request.approval
          const authorize = Effect.gen(function* () {
            const capability = approval.capability
            const approvalId = nestedApprovalId(nestedKey)
            const prior = resolvedApproval(approvalId)
            const denied = (reason: string) =>
              Effect.gen(function* () {
                const failure = NestedOperationDenied.make({
                  operationKey,
                  ordinal,
                  capability,
                  reason,
                })
                yield* settle({ _tag: "Failed", error: failure })
                return yield* failure
              })
            if (prior === undefined) {
              const approvals = yield* Effect.serviceOption(Approvals)
              const resolution = yield* Option.getOrElse(approvals, () => autoApprove).resolve({
                _tag: "Pending",
                token: approvalId,
                call: Response.toolCallPart({
                  id: approvalId,
                  name: capability,
                  params: approval.request ?? request.payload,
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
                    input: approval.request ?? request.payload,
                  })
                  return next
                })
                return yield* NestedOperationSuspended.make({
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
          })
          yield* authorize
        }

        yield* input.store.startOperation({ ...input.claim, operationId: record.operationId }).pipe(Effect.orDie)
        yield* emit("running")
        const exit = yield* Effect.exit(effect)
        if (exit._tag === "Success") {
          const value =
            request.success === undefined
              ? exit.value
              : yield* Schema.encodeEffect(request.success)(exit.value).pipe(Effect.orDie)
          yield* input.store
            .completeOperation({
              ...input.claim,
              operationId: record.operationId,
              outcome: { _tag: "Succeeded", value },
            })
            .pipe(Effect.orDie, Effect.andThen(emit("succeeded", projected(exit.value))))
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
    }

    const waitFor: Service["waitFor"] = (wait) =>
      Ref.get(pending).pipe(
        Effect.map((current) => {
          const approval = current.get(wait.token)
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

const autoApprove: ApprovalsService = { resolve: () => Effect.succeed({ _tag: "Approved" as const }) }
