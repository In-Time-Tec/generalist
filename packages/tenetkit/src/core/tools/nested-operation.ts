import { Cause, Context, Effect, Function, Layer, Option, Ref, Schema } from "effect"
import { digest as canonicalDigest } from "../durable/canonical-json.js"
import { ReplayPolicy } from "../durable/driver/contract.js"
import { ToolContext } from "./tool-context.js"
import type { Outcome } from "./tool-executor.js"

const singleFailureReason = <E>(cause: Cause.Cause<E>) => {
  if (cause.reasons.length !== 1) return undefined
  const reason = cause.reasons[0]
  return reason !== undefined && Cause.isFailReason(reason) ? reason : undefined
}

/** @experimental Replay policy for one nested durable operation. */
export const NestedReplayPolicy = ReplayPolicy
/** @experimental */
export type NestedReplayPolicy = typeof NestedReplayPolicy.Type

const Kind = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))
const Ordinal = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(65535))

/** @experimental Derived identity of one nested operation beneath a composite tool call. */
export const Identity = Schema.Struct({
  operationKey: Schema.String.check(Schema.isNonEmpty()),
  ordinal: Ordinal,
  kind: Kind,
  payloadDigest: Schema.String.check(Schema.isNonEmpty()),
})
/** @experimental */
export type Identity = typeof Identity.Type

/** @experimental Authorization the host must settle before the handler crosses its boundary. */
export const ApprovalRequirement = Schema.Struct({
  capability: Kind,
  request: Schema.optionalKey(Schema.Unknown),
})
/** @experimental */
export type ApprovalRequirement = typeof ApprovalRequirement.Type

/** @experimental One nested operation a composite tool asks the host to journal. */
/**
 * @experimental A host-derived projection of a nested operation's own outcome.
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
/** @experimental */
export type Render = typeof Render.Type

/** @experimental A projection larger than this is withheld whole rather than truncated. */
export const maxRenderBytes = 64 * 1024

/** @experimental Lifecycle of one nested operation as the host observes it. */
export const ProgressStatus = Schema.Literals(["running", "succeeded", "failed", "unknown"])
/** @experimental */
export type ProgressStatus = typeof ProgressStatus.Type

/** @experimental The `ToolContext.Progress` data key nested-operation progress travels under. */
export const progressKey = "nestedOperation"

/** @experimental One nested-operation progress record a host projects. */
export const Progress = Schema.Struct({
  kind: Kind,
  ordinal: Ordinal,
  status: ProgressStatus,
  render: Schema.optionalKey(Render),
  renderWithheldBytes: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
})
/** @experimental */
export type Progress = typeof Progress.Type
type ProgressEncoded = typeof Progress.Encoded

export interface ProgressData {
  readonly [progressKey]: ProgressEncoded
  readonly [key: string]: ProgressEncoded
}

/**
 * @experimental Encodes one progress record under `progressKey`.
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
  readonly replayPolicy: NestedReplayPolicy
  readonly success?: Schema.Codec<A, unknown, never, never>
  readonly failure?: Schema.Codec<E, unknown, never, never>
  readonly approval?: ApprovalRequirement
  readonly render?: (value: A) => Render
}

/** @experimental The same nested identity was reused with different content. */
export class NestedOperationDivergence extends Schema.TaggedError<NestedOperationDivergence>()(
  "tenetkit/core/NestedOperationDivergence",
  {
    operationKey: Schema.String,
    ordinal: Ordinal,
    recordedKind: Kind,
    recordedDigest: Schema.String,
    requestedKind: Kind,
    requestedDigest: Schema.String,
  },
) {}

/** @experimental A non-idempotent nested operation crossed its boundary with an unobserved outcome. */
export class NestedOperationUnknown extends Schema.TaggedError<NestedOperationUnknown>()(
  "tenetkit/core/NestedOperationUnknown",
  { operationKey: Schema.String, ordinal: Ordinal, operationId: Schema.String },
) {}

/** @experimental The host denied the nested operation's approval request. */
export class NestedOperationDenied extends Schema.TaggedError<NestedOperationDenied>()(
  "tenetkit/core/NestedOperationDenied",
  { operationKey: Schema.String, ordinal: Ordinal, capability: Kind, reason: Schema.String },
) {}

/** @experimental The run must suspend until the host resolves the nested operation's approval. */
export class NestedOperationSuspended extends Schema.TaggedError<NestedOperationSuspended>()(
  "tenetkit/core/NestedOperationSuspended",
  { token: Schema.String, operationKey: Schema.String, ordinal: Ordinal, capability: Kind },
) {}

/** @experimental */
export type Failure =
  | NestedOperationDivergence
  | NestedOperationUnknown
  | NestedOperationDenied
  | NestedOperationSuspended

/**
 * @experimental Host seam executing one nested durable operation for a composite tool call.
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

/** @experimental */
export class NestedOperations extends Context.Service<NestedOperations, Service>()(
  "tenetkit/core/tools/nested-operation/NestedOperations",
) {}

/** @experimental Canonical payload digest shared by every nested-operation implementation. */
export const payloadDigest: {
  (payload: Payload): (kind: string) => string
  (kind: string, payload: Payload): string
} = Function.dual(2, (kind: string, payload: Payload): string => canonicalDigest({ kind, payload }))

/** @experimental Derived operation id for one nested operation. */
export const operationId = (input: { readonly operationKey: string; readonly ordinal: number }): string =>
  `${input.operationKey}#${input.ordinal}`

/** @experimental Run one nested durable operation through the ambient host seam. */
export const run: {
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): (request: Request<A, E>) => Effect.Effect<A, E | Failure, R | NestedOperations | ToolContext>
  <A, E, R>(
    request: Request<A, E>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | Failure, R | NestedOperations | ToolContext>
} = Function.dual(
  2,
  <A, E, R>(
    request: Request<A, E>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | Failure, R | NestedOperations | ToolContext> =>
    Effect.flatMap(NestedOperations, (operations) => operations.run(request, effect)),
)

/** @experimental Translate a nested-operation approval suspension into the tool executor's Suspend outcome. */
export const catchSuspension = <E, R>(effect: Effect.Effect<Outcome, E, R>) =>
  Effect.catchIf(effect, Schema.is(NestedOperationSuspended), (error) =>
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
 * @experimental Process-local nested operations for hosts without durable storage.
 *
 * Identity, duplicate return, and divergence hold for the life of the run; approvals auto-approve
 * because a process-local host owns no resolution seam.
 */
export const layerDirect: Layer.Layer<NestedOperations> = Layer.effect(
  NestedOperations,
  Effect.gen(function* () {
    const recordsRef = yield* Ref.make(new Map<string, DirectRecord>())
    const ordinalsRef = yield* Ref.make(new Map<string, number>())
    return NestedOperations.of({
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
              return yield* NestedOperationDivergence.make({
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

/** @experimental */
export const layerTest = (implementation: Service): Layer.Layer<NestedOperations> =>
  Layer.succeed(NestedOperations, NestedOperations.of(implementation))
