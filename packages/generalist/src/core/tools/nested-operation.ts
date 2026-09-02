import { Cause, Context, Effect, Function, Layer, Option, Ref, Schema } from "effect"
import { digest as canonicalDigest } from "../durable/canonical-json.js"
import { ActionableTaggedError, errorHint } from "../error-hint.js"
import { ReplayPolicy as ReplayPolicySchema } from "../durable/driver/contract.js"
import { ToolContext } from "./tool-context.js"
import type { Outcome } from "./tool-executor.js"

const singleFailureReason = <E>(cause: Cause.Cause<E>) => {
  if (cause.reasons.length !== 1) return undefined
  const reason = cause.reasons[0]
  return reason !== undefined && Cause.isFailReason(reason) ? reason : undefined
}

/** Replay policy for one nested durable operation. */
export const ReplayPolicy = ReplayPolicySchema
export type ReplayPolicy = typeof ReplayPolicy.Type

const Kind = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))
const Ordinal = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(65535))

/** Derived identity of one nested operation beneath a composite tool call. */
export const Identity = Schema.Struct({
  operationKey: Schema.String.check(Schema.isNonEmpty()),
  ordinal: Ordinal,
  kind: Kind,
  payloadDigest: Schema.String.check(Schema.isNonEmpty()),
})
export type Identity = typeof Identity.Type

/** Authorization the host must settle before the handler crosses its boundary. */
export const ApprovalRequirement = Schema.Struct({
  capability: Kind,
  request: Schema.optionalKey(Schema.Unknown),
})
export type ApprovalRequirement = typeof ApprovalRequirement.Type

/** One nested operation a composite tool asks the host to journal. */
/**
 * A host-derived projection of a nested operation's own outcome.
 *
 * The value is produced by the handler's `render` function from the operation's real result, never
 * read from the request payload, so a cell that plants `render` in its input cannot dictate what
 * the host displays.
 */
export const Render = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag("Artifact"),
    path: Schema.String.check(Schema.isNonEmpty()),
    mimeType: Schema.String.check(Schema.isNonEmpty()),
    byteSize: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    width: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
    height: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  }),
  Schema.Struct({
    _tag: Schema.tag("Diff"),
    path: Schema.String.check(Schema.isNonEmpty()),
    patch: Schema.String,
  }),
])
export type Render = typeof Render.Type

/** A projection larger than this is withheld whole rather than truncated. */
export const maxRenderBytes = 64 * 1024

/** Lifecycle of one nested operation as the host observes it. */
export const ProgressStatus = Schema.Literals(["running", "succeeded", "failed", "unknown"])
export type ProgressStatus = typeof ProgressStatus.Type

/** The `ToolContext.Progress` data key nested-operation progress travels under. */
export const progressKey = "nestedOperation"

/** One nested-operation progress record a host projects. */
export const Progress = Schema.Struct({
  kind: Kind,
  ordinal: Ordinal,
  status: ProgressStatus,
  render: Schema.optionalKey(Render),
  renderWithheldBytes: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
})
export type Progress = typeof Progress.Type
type ProgressEncoded = typeof Progress.Encoded

interface ProgressData {
  readonly [progressKey]: ProgressEncoded
  readonly [key: string]: ProgressEncoded
}

/**
 * Encodes one progress record under `progressKey`.
 *
 * An oversized projection is withheld whole and reported as `renderWithheldBytes`: a partial diff
 * or a truncated artifact descriptor would render as a smaller correct change rather than as a
 * missing one, so the operation still succeeds while the projection is dropped.
 */
export const progressData = (input: {
  readonly kind: string
  readonly ordinal: number
  readonly status: ProgressStatus
  readonly render?: Render | undefined
}): Effect.Effect<ProgressData> =>
  Effect.gen(function* () {
    if (input.render === undefined) {
      return { [progressKey]: { kind: input.kind, ordinal: input.ordinal, status: input.status } }
    }
    const encodable = yield* Effect.option(
      Effect.all({
        serialized: Schema.encodeEffect(Schema.fromJsonString(Render))(input.render),
        encoded: Schema.encodeEffect(Render)(input.render),
      }),
    )
    const projection = Option.getOrUndefined(encodable)
    const byteSize = projection === undefined ? 0 : new TextEncoder().encode(projection.serialized).byteLength
    const withheld = byteSize > maxRenderBytes
    let progress: ProgressEncoded = { kind: input.kind, ordinal: input.ordinal, status: input.status }
    if (projection !== undefined && !withheld) progress = { ...progress, render: projection.encoded }
    if (withheld) progress = { ...progress, renderWithheldBytes: byteSize }
    return { [progressKey]: progress }
  })
type Payload = typeof Schema.Unknown.Type
export interface Request<A = unknown, E = unknown> {
  readonly kind: string
  readonly payload: Payload
  readonly replayPolicy: ReplayPolicy
  readonly success?: Schema.Codec<A, unknown, never, never>
  readonly failure?: Schema.Codec<E, unknown, never, never>
  readonly approval?: ApprovalRequirement
  readonly render?: (value: A) => Render
}

/** The same nested identity was reused with different content. */
export class Divergence extends ActionableTaggedError<Divergence>()("generalist/core/NestedOperationDivergence", {
  operationKey: Schema.String,
  ordinal: Ordinal,
  recordedKind: Kind,
  recordedDigest: Schema.String,
  requestedKind: Kind,
  requestedDigest: Schema.String,
  hint: errorHint("Use a new operation identity or replay the exact original nested operation content."),
}) {}

/** A non-idempotent nested operation crossed its boundary with an unobserved outcome. */
export class Unknown extends ActionableTaggedError<Unknown>()("generalist/core/NestedOperationUnknown", {
  operationKey: Schema.String,
  ordinal: Ordinal,
  operationId: Schema.String,
  hint: errorHint("Reconcile the non-idempotent operation with the host before deciding whether to retry."),
}) {}

/** The host denied the nested operation's approval request. */
export class Denied extends ActionableTaggedError<Denied>()("generalist/core/NestedOperationDenied", {
  operationKey: Schema.String,
  ordinal: Ordinal,
  capability: Kind,
  reason: Schema.String,
  hint: errorHint("Grant the named capability or remove the denied nested operation."),
}) {}

/** The run must suspend until the host resolves the nested operation's approval. */
export class Suspended extends ActionableTaggedError<Suspended>()("generalist/core/NestedOperationSuspended", {
  token: Schema.String,
  operationKey: Schema.String,
  ordinal: Ordinal,
  capability: Kind,
  hint: errorHint("Resolve the host approval and resume with the recorded token."),
}) {}
export type Failure = Divergence | Unknown | Denied | Suspended

/**
 * Host seam executing one nested durable operation for a composite tool call.
 *
 * Identity is derived, never supplied: the ambient `ToolContext` names the outer operation and the
 * host assigns the ordinal, so cell or tool code cannot forge, reorder, or collide with another
 * call's journal.
 */
export interface Service {
  readonly run: <A, E, R>(
    request: Request<A, E>,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | Failure, R | ToolContext>
}
export class Operations extends Context.Service<Operations, Service>()(
  "generalist/core/tools/nested-operation/Operations",
) {}

/** Canonical payload digest shared by every nested-operation implementation. */
export const payloadDigest: {
  (payload: Payload): (kind: string) => string
  (kind: string, payload: Payload): string
} = Function.dual(2, (kind: string, payload: Payload): string => canonicalDigest({ kind, payload }))

/** Derived operation id for one nested operation. */
export const operationId = (input: { readonly operationKey: string; readonly ordinal: number }): string =>
  `${input.operationKey}#${input.ordinal}`

/** Run one nested durable operation through the ambient host seam. */
export const run: {
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): (request: Request<A, E>) => Effect.Effect<A, E | Failure, R | Operations | ToolContext>
  <A, E, R>(
    request: Request<A, E>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | Failure, R | Operations | ToolContext>
} = Function.dual(
  2,
  <A, E, R>(
    request: Request<A, E>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | Failure, R | Operations | ToolContext> =>
    Effect.flatMap(Operations, (operations) => operations.run(request, effect)),
)

/** Translate a nested-operation approval suspension into the tool executor's Suspend outcome. */
export const catchSuspension = <E, R>(effect: Effect.Effect<Outcome, E, R>) =>
  Effect.catchIf(effect, Schema.is(Suspended), (error) =>
    Effect.succeed<Outcome>({ _tag: "Suspend", token: error.token }),
  )

interface DirectRecord {
  readonly kind: string
  readonly payloadDigest: string
  readonly outcome:
    | { readonly _tag: "Succeeded"; readonly value: unknown }
    | { readonly _tag: "Failed"; readonly error: unknown }
}

/**
 * Process-local nested operations for hosts without durable storage.
 *
 * Identity, duplicate return, and divergence hold for the life of the run; approvals auto-approve
 * because a process-local host owns no resolution seam.
 */
export const layerDirect: Layer.Layer<Operations> = Layer.effect(
  Operations,
  Effect.gen(function* () {
    const recordsRef = yield* Ref.make(new Map<string, DirectRecord>())
    const ordinalsRef = yield* Ref.make(new Map<string, number>())
    return Operations.of({
      run: <A, E, R>(request: Request<A, E>, effect: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          const context = yield* ToolContext
          const operationKey = context.operationKey ?? context.toolCallId ?? context.sessionId
          const ordinal = yield* Ref.modify(ordinalsRef, (current) => {
            const next = new Map(current)
            const value = current.get(operationKey) ?? 0
            next.set(operationKey, value + 1)
            return [value, next] as const
          })
          const requestedDigest = payloadDigest(request.kind, request.payload)
          const id = operationId({ operationKey, ordinal })
          const recorded = (yield* Ref.get(recordsRef)).get(id)
          if (recorded !== undefined && request.success !== undefined && request.failure !== undefined) {
            if (recorded.kind !== request.kind || recorded.payloadDigest !== requestedDigest) {
              return yield* Divergence.make({
                operationKey,
                ordinal,
                recordedKind: recorded.kind,
                recordedDigest: recorded.payloadDigest,
                requestedKind: request.kind,
                requestedDigest,
              })
            }
            return yield* recorded.outcome._tag === "Succeeded"
              ? Schema.decodeUnknownEffect(request.success)(recorded.outcome.value).pipe(Effect.orDie)
              : Schema.decodeUnknownEffect(request.failure)(recorded.outcome.error).pipe(Effect.orDie, Effect.flip)
          }
          const exit = yield* Effect.exit(effect)
          const reason = exit._tag === "Failure" ? singleFailureReason(exit.cause) : undefined
          let outcome: DirectRecord["outcome"] | undefined
          if (exit._tag === "Success" && request.success !== undefined) {
            outcome = {
              _tag: "Succeeded",
              value: yield* Schema.encodeEffect(request.success)(exit.value).pipe(Effect.orDie),
            }
          } else if (reason !== undefined && request.failure !== undefined) {
            outcome = {
              _tag: "Failed",
              error: yield* Schema.encodeEffect(request.failure)(reason.error).pipe(Effect.orDie),
            }
          }
          if (outcome !== undefined) {
            yield* Ref.update(recordsRef, (current) => {
              const next = new Map(current)
              next.set(id, { kind: request.kind, payloadDigest: requestedDigest, outcome })
              return next
            })
          }
          return yield* exit
        }),
    })
  }),
)
export const layerTest = (implementation: Service): Layer.Layer<Operations> =>
  Layer.succeed(Operations, Operations.of(implementation))
