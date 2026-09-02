import { Schema } from "effect"
import { digest } from "../../../core/durable/canonical-json.js"
import { ActionableTaggedError, errorHint } from "../../../core/error-hint.js"
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
export class ExternalChildCapacityUnavailable extends ActionableTaggedError<ExternalChildCapacityUnavailable>()(
  "generalist/runtime/ExternalChildCapacityUnavailable",
  {
    parentRunId: Schema.String,
    limit: Schema.Int,
    hint: errorHint("Wait for an existing child to settle or raise the parent's child capacity."),
  },
) {}

/** A placement id was replayed with different immutable facts. */
export class ExternalChildPlacementConflict extends ActionableTaggedError<ExternalChildPlacementConflict>()(
  "generalist/runtime/ExternalChildPlacementConflict",
  {
    placementId: Schema.String,
    hint: errorHint("Reuse the placement id only with its original immutable child placement facts."),
  },
) {}

/** No external placement has this id. */
export class ExternalChildPlacementNotFound extends ActionableTaggedError<ExternalChildPlacementNotFound>()(
  "generalist/runtime/ExternalChildPlacementNotFound",
  {
    placementId: Schema.String,
    hint: errorHint("Create or reserve the external child placement before reading or settling it."),
  },
) {}

/** A settlement identity was replayed with a different outcome. */
export class ExternalChildSettlementConflict extends ActionableTaggedError<ExternalChildSettlementConflict>()(
  "generalist/runtime/ExternalChildSettlementConflict",
  {
    placementId: Schema.String,
    settlementId: Schema.String,
    hint: errorHint("Replay the settlement identity only with its original outcome."),
  },
) {}

/** An external root identity was replayed with different immutable facts. */
export class ExternalRootConflict extends ActionableTaggedError<ExternalRootConflict>()(
  "generalist/runtime/ExternalRootConflict",
  {
    placementId: Schema.String,
    hint: errorHint("Reuse the placement id only with its original immutable external root facts."),
  },
) {}

/** No locally owned external root has this placement id. */
export class ExternalRootNotFound extends ActionableTaggedError<ExternalRootNotFound>()(
  "generalist/runtime/ExternalRootNotFound",
  {
    placementId: Schema.String,
    hint: errorHint("Create the locally owned external root before reading or settling it."),
  },
) {}

/** The supplied digest does not identify the root executable. */
export class ExternalRootExecutableMismatch extends ActionableTaggedError<ExternalRootExecutableMismatch>()(
  "generalist/runtime/ExternalRootExecutableMismatch",
  {
    placementId: Schema.String,
    expected: Schema.String,
    actual: Schema.String,
    hint: errorHint("Run the placement with the executable digest that was originally reserved."),
  },
) {}
