import { Schema } from "effect"
import { ArtifactHead, ArtifactUpdate } from "../../../core/artifact.js"
import { Denied as NestedOperationDenied } from "../../../core/tools/nested-operation.js"
import { WakeEvent } from "../../../core/agent/tools/wake-event.js"
import { Ref as MediaRef } from "../../../media/ref.js"
import { Address } from "../../../runtime/address.js"
import { FanOutJoin, FanOutMemberResult, FanOutRemainder, FanOutStatus } from "../../../runtime/child/fan-out.js"
import { ExternalRoot, Placement } from "../../../runtime/child/external/placement.js"
import { ChildReadiness } from "../../../runtime/child/readiness.js"
import { Cursor } from "../../../runtime/cursor.js"
import { ExecutableManifest, ExecutableRef, PinnedExecutable } from "../../../runtime/executable/manifest.js"
import { ExecutableRegistration } from "../../../runtime/executable/registration.js"
import { ExecutionCheckpoint, ExecutionSuspension } from "../../../runtime/execution/state.js"
import { ScheduleRecord } from "../../../runtime/execution/trigger/schedule.js"
import { MailboxEntry } from "../../../runtime/messaging/mailbox.js"
import { Message } from "../../../runtime/messaging/message.js"
import type {
  RuntimeState as State,
  StoredArtifact,
  StoredHostSession,
  StoredRun,
  TreeRoot,
} from "../../../runtime/state/state.js"
import { OperationKind, OperationStatus, ReplayPolicy, type OperationRecord } from "../../../runtime/operation/record.js"
import { OperationResolution } from "../../../runtime/operation/resolution.js"
import { ProgramOperationRecord, ProgramRunState } from "../../../runtime/program/store.js"
import { RunFailure, RunReceipt, RunStatus } from "../../../runtime/run.js"
import { Point } from "../../../runtime/run/acknowledgement.js"
import { RunEvent, SteeringDiscardReason } from "../../../runtime/run/event.js"
import { ExecutionContinuation, SteeringEntry } from "../../../runtime/run/steering.js"
import { PendingRunOutcome } from "../../../runtime/run/store.js"
import { RunWait } from "../../../runtime/run/wait.js"
import { HostSession } from "../../../runtime/session/host.js"
import { TreeEvent } from "../../../runtime/tree.js"
import { TreePolicy } from "../../../runtime/tree/policy.js"
import { SessionEntryCodec } from "./session.js"

const Counter = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const strings = Schema.Array(Schema.String)
const map = <S extends Schema.Constraint>(value: S) => Schema.ReadonlyMap(Schema.String, value)

export const SessionWriteClaim = Schema.Struct({
  sessionId: Schema.String,
  runId: Schema.String,
  ownerId: Schema.String,
  runAttemptFence: Counter,
  epoch: Schema.String.check(Schema.isPattern(/^(0|[1-9][0-9]*)$/)),
})

export const ExecutionClaim = Schema.Struct({
  runId: Schema.String,
  ownerId: Schema.String,
  attemptFence: Counter,
  session: SessionWriteClaim,
})


const Run = Schema.Struct({
  runId: Schema.String,
  status: RunStatus,
  executableRef: ExecutableRef,
  executableManifest: ExecutableManifest,
  address: Address,
  message: Message,
  rootRunId: Schema.String,
  depth: Counter,
  treePolicy: TreePolicy,
  parentRunId: Schema.optionalKey(Schema.String),
  forkedFrom: Schema.optionalKey(Schema.String),
  forkSequence: Schema.optionalKey(Counter),
  childReadiness: Schema.optionalKey(ChildReadiness),
  operationNamespace: Schema.optionalKey(Schema.String),
  invocationId: Schema.optionalKey(Schema.String),
  lastSequence: Cursor,
  lastTurnCompletedSequence: Cursor,
  attempt: Counter,
  attemptFence: Counter,
  ownerId: Schema.optionalKey(Schema.String),
  checkpoint: Schema.optionalKey(ExecutionCheckpoint),
  suspension: Schema.optionalKey(ExecutionSuspension),
  continuation: Schema.optionalKey(ExecutionContinuation),
  cancellationRequested: Schema.Boolean,
  cancelReason: Schema.optionalKey(Schema.String),
  terminalEventId: Schema.optionalKey(Schema.String),
  pendingOutcome: Schema.optionalKey(PendingRunOutcome),
  children: strings,
  events: Schema.Array(RunEvent),
  steering: Schema.Array(Schema.Struct({
    ...SteeringEntry.fields,
    consumedOperationId: Schema.optionalKey(Schema.String),
    discardedReason: Schema.optionalKey(SteeringDiscardReason),
  })),
  registrations: Schema.Array(ExecutableRegistration),
  checkpoints: Schema.ReadonlyMap(Counter, Schema.UndefinedOr(ExecutionCheckpoint)),
} satisfies { readonly [K in keyof Omit<StoredRun, "subscribers">]-?: Schema.Constraint })

/** Known framework failures use their domain codec; malformed tagged failures cannot fall through as opaque data. */
const FrameworkOperationError = Schema.Union([...RunFailure.members, NestedOperationDenied]).pipe(Schema.toTaggedUnion("_tag"))

export const OperationError = Schema.Union([
  FrameworkOperationError,
  Schema.Unknown.check(Schema.makeFilter(
    (value) =>
      value === null ||
      typeof value !== "object" ||
      !("_tag" in value) ||
      typeof value._tag !== "string" ||
      !Object.hasOwn(FrameworkOperationError.cases, value._tag),
    { message: "Framework operation failures must match their RunFailure schema" },
  )),
])
const FanOutMember = Schema.Struct({
  ...FanOutMemberResult.fields,
  error: Schema.optionalKey(OperationError),
})


export const Operation: Schema.Codec<OperationRecord, unknown> = Schema.Struct({
  runId: Schema.String,
  operationId: Schema.String,
  operationKey: Schema.String,
  kind: OperationKind,
  status: OperationStatus,
  inputDigest: Schema.String,
  input: Schema.Unknown,
  result: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(OperationError),
  replayPolicy: ReplayPolicy,
  attempt: Counter,
  resolutionIdempotencyKey: Schema.optionalKey(Schema.String),
  resolution: Schema.optionalKey(OperationResolution),
  checkpoint: Schema.optionalKey(ExecutionCheckpoint),
  completedSequence: Schema.optionalKey(Counter),
} satisfies { readonly [K in keyof OperationRecord]-?: Schema.Constraint })

// ScheduleRecord is deliberately an opaque domain codec. Keep its transform rather
// than duplicating the schedule definition just to add lease ownership fields.
const ScheduleClaim = Schema.Struct({
  schedule: ScheduleRecord,
  ownerId: Schema.String,
  leaseExpiresAt: Schema.String,
})

export type LocalOnly = "closed" | "nextSubscriberId" | "subscriberQueueCapacity" | "publications" | "artifactPublications"
export type CanonicalState = Omit<
  State,
  LocalOnly | "runs" | "hostSessions" | "treeRoots" | "artifacts" | "scheduleClaims"
> & {
  readonly runs: ReadonlyMap<string, Omit<StoredRun, "subscribers">>
  readonly hostSessions: ReadonlyMap<string, Omit<StoredHostSession, "subscribers">>
  readonly treeRoots: ReadonlyMap<string, Omit<TreeRoot, "subscribers">>
  readonly artifacts: ReadonlyMap<string, Omit<StoredArtifact, "subscribers">>
  readonly scheduleClaims: ReadonlyMap<string, typeof ScheduleClaim.Type>
}

/** Every canonical top-level field is required; additions to State fail this exhaustiveness check. */
export const RuntimeState: Schema.Codec<CanonicalState, unknown> = Schema.Struct({
  nextRunCounter: Counter,
  nextOperationCounter: Counter,
  nextSteeringCounter: Counter,
  nextMessageCounter: Counter,
  runs: map(Run),
  waits: map(RunWait),
  sessions: map(Schema.Struct({
    entries: map(SessionEntryCodec),
    order: strings,
    leaf: Schema.NullOr(Schema.String),
    counter: Counter,
    writerEpoch: Schema.BigInt.check(Schema.isGreaterThanOrEqualToBigInt(0n)),
    writer: Schema.optionalKey(Schema.Struct({
      runId: Schema.String,
      ownerId: Schema.String,
      runAttemptFence: Counter,
    })),
  })),
  hostSessions: map(Schema.Struct({
    session: HostSession,
    lastCursor: Cursor,
    events: Schema.Array(Schema.Struct({ cursor: Cursor, event: RunEvent })),
  })),
  treeRoots: map(Schema.Struct({
    earliestPosition: Counter,
    lastPosition: Cursor,
    events: Schema.Array(TreeEvent),
  })),
  lanes: map(Schema.Struct({ queue: strings, acceptedSequence: Counter })),
  idempotency: map(Schema.Struct({ digest: Schema.String, executable: PinnedExecutable, receipt: RunReceipt })),
  registrationCatalog: map(Schema.Struct({ digest: Schema.String, value: ExecutableRegistration })),
  fanOuts: map(Schema.Struct({
    fanOutId: Schema.String,
    parentRunId: Schema.String,
    idempotencyKey: Schema.String,
    digest: Schema.String,
    status: FanOutStatus,
    join: FanOutJoin,
    remainder: FanOutRemainder,
    concurrency: Counter,
    members: Schema.Array(FanOutMember),
  })),
  operations: map(Operation),
  programStates: map(ProgramRunState),
  programOperations: map(ProgramOperationRecord),
  addressBindings: map(Schema.Struct({ ref: ExecutableRef, manifest: ExecutableManifest })),
  messages: map(MailboxEntry),
  agentNames: map(Schema.String),
  externalChildPlacements: map(Placement),
  externalRoots: map(ExternalRoot),
  acknowledgements: map(Point),
  wakeEvents: map(WakeEvent),
  schedules: map(ScheduleRecord),
  scheduleClaims: map(ScheduleClaim),
  artifacts: map(Schema.Struct({
    head: ArtifactHead,
    baseVersion: Counter,
    baseSnapshot: MediaRef,
    updates: Schema.Array(ArtifactUpdate),
  })),
  workers: map(Schema.Struct({ expiresAt: Schema.Finite, incarnation: Schema.String })),
} satisfies { readonly [K in keyof Omit<State, LocalOnly>]: Schema.Constraint })
