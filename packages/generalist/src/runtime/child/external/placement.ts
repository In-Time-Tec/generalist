import { Schema } from "effect"
import { digest } from "../../../core/durable/canonical-json.js"
import { ExecutionCheckpoint, ExecutionSuspension } from "../../execution/state.js"
import { PinnedExecutable } from "../../executable/manifest.js"
import { RunOutcome } from "../../run.js"
import { RunWait } from "../../run/wait.js"
import { ExecutionContinuation } from "../../run/steering.js"

/** A Run address owned by an external partition. */
export const ExternalRunRef = Schema.Struct({ partition: Schema.String, runId: Schema.String })
export type ExternalRunRef = typeof ExternalRunRef.Type

/** Stable digest of the exact executable admitted on the child partition. */
export const executableDigest = (executable: PinnedExecutable): string =>
  digest(Schema.encodeSync(PinnedExecutable)(executable))

/** Optional parent suspension committed atomically with external placement. */
export const ParentSuspension = Schema.Struct({
  wait: RunWait,
  suspension: ExecutionSuspension,
  checkpoint: Schema.optionalKey(ExecutionCheckpoint),
  continuation: Schema.optionalKey(Schema.NullOr(ExecutionContinuation)),
})
export type ParentSuspension = typeof ParentSuspension.Type

/** Immutable admission facts plus current parent claim authority. */
export const ReserveInput = Schema.Struct({
  placementId: Schema.String,
  runId: Schema.String,
  ownerId: Schema.String,
  attemptFence: Schema.Int,
  session: Schema.Struct({
    sessionId: Schema.String,
    runId: Schema.String,
    ownerId: Schema.String,
    runAttemptFence: Schema.Finite,
    epoch: Schema.String,
  }),
  ref: ExternalRunRef,
  invocationId: Schema.String,
  requestDigest: Schema.String,
  executableDigest: Schema.String,
  parentSuspension: Schema.optionalKey(ParentSuspension),
})
export type ReserveInput = typeof ReserveInput.Type

/** Stored placement state returned by every placement operation. */
export const Placement = Schema.Struct({
  placementId: Schema.String,
  parentRunId: Schema.String,
  ref: ExternalRunRef,
  invocationId: Schema.String,
  requestDigest: Schema.String,
  executableDigest: Schema.String,
  waitId: Schema.optionalKey(Schema.String),
  suspensionIdentity: Schema.optionalKey(Schema.String),
  acknowledged: Schema.Boolean,
  cancelRequested: Schema.Boolean,
  settled: Schema.Boolean,
  settlementId: Schema.optionalKey(Schema.String),
  outcome: Schema.optionalKey(RunOutcome),
})
export type Placement = typeof Placement.Type

/** A depth-zero child root owned by this partition. */
export const ExternalRoot = Schema.Struct({
  placementId: Schema.String,
  parent: ExternalRunRef,
  ref: ExternalRunRef,
  sessionId: Schema.String,
  requestDigest: Schema.String,
  executableDigest: Schema.String,
  admissionDigest: Schema.String,
  activated: Schema.Boolean,
  cancelRequested: Schema.Boolean,
  settlementAcknowledged: Schema.Boolean,
  outcome: Schema.optionalKey(RunOutcome),
})
export type ExternalRoot = typeof ExternalRoot.Type

/** Durable terminal delivery replayed until the parent acknowledges it. */
export const ExternalRootSettlement = Schema.Struct({
  placementId: Schema.String,
  ref: ExternalRunRef,
  settlementId: Schema.String,
  outcome: RunOutcome,
  acknowledged: Schema.Boolean,
})
export type ExternalRootSettlement = typeof ExternalRootSettlement.Type

/** Stable identity of an optional parent wait/suspension closure. */
export const suspensionIdentity = (input: ParentSuspension): string =>
  digest(Schema.encodeSync(ParentSuspension)(input))

/** No child slot is available; reservation made no mutation. */
export class ExternalChildCapacityUnavailable extends Schema.TaggedError<ExternalChildCapacityUnavailable>()(
  "generalist/runtime/ExternalChildCapacityUnavailable",
  { parentRunId: Schema.String, limit: Schema.Int },
) {}

/** A placement id was replayed with different immutable facts. */
export class ExternalChildPlacementConflict extends Schema.TaggedError<ExternalChildPlacementConflict>()(
  "generalist/runtime/ExternalChildPlacementConflict",
  { placementId: Schema.String },
) {}

/** No external placement has this id. */
export class ExternalChildPlacementNotFound extends Schema.TaggedError<ExternalChildPlacementNotFound>()(
  "generalist/runtime/ExternalChildPlacementNotFound",
  { placementId: Schema.String },
) {}

/** A settlement identity was replayed with a different outcome. */
export class ExternalChildSettlementConflict extends Schema.TaggedError<ExternalChildSettlementConflict>()(
  "generalist/runtime/ExternalChildSettlementConflict",
  { placementId: Schema.String, settlementId: Schema.String },
) {}

/** An external root identity was replayed with different immutable facts. */
export class ExternalRootConflict extends Schema.TaggedError<ExternalRootConflict>()(
  "generalist/runtime/ExternalRootConflict",
  { placementId: Schema.String },
) {}

/** No locally owned external root has this placement id. */
export class ExternalRootNotFound extends Schema.TaggedError<ExternalRootNotFound>()(
  "generalist/runtime/ExternalRootNotFound",
  { placementId: Schema.String },
) {}

/** The supplied digest does not identify the root executable. */
export class ExternalRootExecutableMismatch extends Schema.TaggedError<ExternalRootExecutableMismatch>()(
  "generalist/runtime/ExternalRootExecutableMismatch",
  { placementId: Schema.String, expected: Schema.String, actual: Schema.String },
) {}
