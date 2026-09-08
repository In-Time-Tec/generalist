import { Schema } from "effect"
import { Checkpoint as ComponentCheckpoint } from "../../../core/durable/component/state.js"
import { ArtifactHead, ArtifactUpdate } from "../../../core/artifact.js"
import { WakeEvent } from "../../../core/agent/tools/wake-event.js"
import { Ref as MediaRef } from "../../../media/ref.js"
import { Address } from "../../../runtime/address.js"
import { FanOutJoin, FanOutMemberResult, FanOutRemainder, FanOutStatus } from "../../../runtime/child/fan-out.js"
import { ExternalRoot, Placement } from "../../../runtime/child/external/placement.js"
import { ChildReadiness } from "../../../runtime/child/readiness.js"
import { Cursor } from "../../../runtime/cursor.js"
import { ExecutableManifest, ExecutableRef } from "../../../runtime/executable/manifest.js"
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
} from "../../../runtime/state/projection.js"
import {
  OperationKind,
  OperationStatus,
  ReplayPolicy,
  type OperationRecord,
} from "../../../runtime/operation/record.js"
import { OperationResolution } from "../../../runtime/operation/resolution.js"
import { ProgramOperationRecord, ProgramRunState } from "../../../runtime/program/store.js"
import { RunReceipt, RunStatus } from "../../../runtime/run.js"
import { Point } from "../../../runtime/run/acknowledgement.js"
import { RunEvent, SteeringDiscardReason } from "../../../runtime/run/event.js"
import { ExecutionContinuation, SteeringEntry } from "../../../runtime/run/steering.js"
import { PendingRunOutcome } from "../../../runtime/run/store.js"
import { RunWait } from "../../../runtime/run/wait.js"
import { HostSession, HostSessionEvent } from "../../../runtime/session/host.js"
import { TreeEvent } from "../../../runtime/tree.js"
import { TreePolicy } from "../../../runtime/tree/policy.js"
import { SessionEntryCodec } from "./session.js"
import { FrameworkError } from "./framework-error.js"
import type { DataSchema, Reuse } from "./cache.js"

const Counter = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const strings = Schema.Array(Schema.String)

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

const makeRun = (reuse: Reuse) =>
  reuse(
    Schema.Struct({
      runId: Schema.String,
      status: RunStatus,
      executableRef: ExecutableRef,
      address: Address,
      message: reuse(Message),
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
      initialSessionComponents: Schema.optionalKey(Schema.Array(ComponentCheckpoint)),
      checkpoint: Schema.optionalKey(reuse(ExecutionCheckpoint)),
      suspension: Schema.optionalKey(reuse(ExecutionSuspension)),
      continuation: Schema.optionalKey(reuse(ExecutionContinuation)),
      cancellationRequested: Schema.Boolean,
      cancelReason: Schema.optionalKey(Schema.String),
      terminalEventId: Schema.optionalKey(Schema.String),
      pendingOutcome: Schema.optionalKey(PendingRunOutcome),
      children: strings,
      events: reuse(Schema.Array(reuse(RunEvent))),
      steering: reuse(
        Schema.Array(
          reuse(
            Schema.Struct({
              ...SteeringEntry.fields,
              consumedOperationId: Schema.optionalKey(Schema.String),
              discardedReason: Schema.optionalKey(SteeringDiscardReason),
            }),
          ),
        ),
      ),
      registrations: reuse(Schema.Array(reuse(ExecutableRegistration))),
      checkpoints: reuse(Schema.ReadonlyMap(Counter, Schema.UndefinedOr(reuse(ExecutionCheckpoint)))),
    } satisfies { readonly [K in keyof CanonicalRun]-?: Schema.Constraint }),
  )

/** Known framework failures use their domain codec; malformed tagged failures cannot fall through as opaque data. */
export const OperationError = Schema.Union([
  FrameworkError,
  Schema.Unknown.check(
    Schema.makeFilter(
      (value) =>
        !Schema.is(Schema.Struct({ _tag: Schema.String }))(value) || !Object.hasOwn(FrameworkError.cases, value._tag),
      { message: "Framework operation failures must match their RunFailure schema" },
    ),
  ),
])
const FanOutMember = Schema.Struct({
  ...FanOutMemberResult.fields,
  error: Schema.optionalKey(OperationError),
})

const makeOperation = (reuse: Reuse): Schema.Codec<OperationRecord, unknown> =>
  reuse(
    Schema.Struct({
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
      checkpoint: Schema.optionalKey(reuse(ExecutionCheckpoint)),
      completedSequence: Schema.optionalKey(Counter),
    } satisfies { readonly [K in keyof OperationRecord]-?: Schema.Constraint }),
  )

export const Operation = makeOperation((schema) => Schema.make(schema.ast))

// ScheduleRecord is deliberately an opaque domain codec. Keep its transform rather
// than duplicating the schedule definition just to add lease ownership fields.
const ScheduleClaim = Schema.Struct({
  schedule: ScheduleRecord,
  ownerId: Schema.String,
  leaseExpiresAt: Schema.String,
})

export type LocalOnly =
  | "closed"
  | "nextSubscriberId"
  | "subscriberQueueCapacity"
  | "publications"
  | "artifactPublications"
export type HydratedState = Omit<
  State,
  LocalOnly | "runs" | "hostSessions" | "treeRoots" | "artifacts" | "scheduleClaims"
> & {
  readonly runs: ReadonlyMap<string, Omit<StoredRun, "subscribers">>
  readonly hostSessions: ReadonlyMap<string, Omit<StoredHostSession, "subscribers">>
  readonly treeRoots: ReadonlyMap<string, Omit<TreeRoot, "subscribers">>
  readonly artifacts: ReadonlyMap<string, Omit<StoredArtifact, "subscribers">>
  readonly scheduleClaims: ReadonlyMap<string, typeof ScheduleClaim.Type>
}

export type CanonicalRun = Omit<StoredRun, "subscribers" | "executableManifest">
export type CanonicalState = Omit<HydratedState, "runs" | "idempotency" | "addressBindings"> & {
  readonly runs: ReadonlyMap<string, CanonicalRun>
  readonly idempotency: ReadonlyMap<
    string,
    {
      readonly digest: string
      readonly executable: ExecutableRef
      readonly receipt: RunReceipt
    }
  >
  readonly addressBindings: ReadonlyMap<string, ExecutableRef>
}

/** Every canonical top-level field is required; additions to State fail this exhaustiveness check. */
export type Table = <S extends DataSchema>(value: S) => Schema.Codec<ReadonlyMap<string, S["Type"]>, unknown>

export const fields = ({ reuse, table }: { readonly reuse: Reuse; readonly table?: Table }) => {
  const map = <S extends DataSchema>(value: S) => reuse(Schema.ReadonlyMap(Schema.String, reuse(value)))
  const rootMap = table ?? map
  return {
    nextRunCounter: Counter,
    nextOperationCounter: Counter,
    nextSteeringCounter: Counter,
    nextMessageCounter: Counter,
    runs: rootMap(makeRun(reuse)),
    waits: rootMap(RunWait),
    sessions: rootMap(
      Schema.Struct({
        entries: map(SessionEntryCodec),
        order: strings,
        leaf: Schema.NullOr(Schema.String),
        counter: Counter,
        writerEpoch: Schema.BigInt.check(Schema.isGreaterThanOrEqualToBigInt(0n)),
        components: Schema.optionalKey(Schema.Array(ComponentCheckpoint)),
        writer: Schema.optionalKey(
          Schema.Struct({
            runId: Schema.String,
            ownerId: Schema.String,
            runAttemptFence: Counter,
          }),
        ),
      }),
    ),
    hostSessions: rootMap(
      Schema.Struct({
        session: HostSession,
        lastCursor: Cursor,
        events: reuse(Schema.Array(reuse(HostSessionEvent))),
      }),
    ),
    treeRoots: rootMap(
      Schema.Struct({
        earliestPosition: Counter,
        lastPosition: Cursor,
        events: reuse(Schema.Array(reuse(TreeEvent))),
      }),
    ),
    lanes: rootMap(Schema.Struct({ queue: strings, acceptedSequence: Counter })),
    idempotency: rootMap(Schema.Struct({ digest: Schema.String, executable: ExecutableRef, receipt: RunReceipt })),
    executableCatalog: rootMap(ExecutableManifest),
    registrationCatalog: rootMap(Schema.Struct({ digest: Schema.String, value: ExecutableRegistration })),
    fanOuts: rootMap(
      Schema.Struct({
        fanOutId: Schema.String,
        parentRunId: Schema.String,
        idempotencyKey: Schema.String,
        digest: Schema.String,
        status: FanOutStatus,
        join: FanOutJoin,
        remainder: FanOutRemainder,
        concurrency: Counter,
        members: Schema.Array(FanOutMember),
      }),
    ),
    operations: rootMap(makeOperation(reuse)),
    programStates: rootMap(ProgramRunState),
    programOperations: rootMap(ProgramOperationRecord),
    addressBindings: rootMap(ExecutableRef),
    messages: rootMap(MailboxEntry),
    agentNames: rootMap(Schema.String),
    externalChildPlacements: rootMap(Placement),
    externalRoots: rootMap(ExternalRoot),
    acknowledgements: rootMap(Point),
    wakeEvents: rootMap(WakeEvent),
    schedules: rootMap(ScheduleRecord),
    scheduleClaims: rootMap(ScheduleClaim),
    artifacts: rootMap(
      Schema.Struct({
        head: ArtifactHead,
        baseVersion: Counter,
        baseSnapshot: MediaRef,
        updates: reuse(Schema.Array(reuse(ArtifactUpdate))),
      }),
    ),
    workers: rootMap(Schema.Struct({ expiresAt: Schema.Finite, incarnation: Schema.String })),
  } satisfies { readonly [K in keyof Omit<State, LocalOnly>]: Schema.Constraint }
}

export const make = (reuse: Reuse): Schema.Codec<CanonicalState, unknown> => reuse(Schema.Struct(fields({ reuse })))

export const RuntimeState = make((schema) => Schema.make(schema.ast))
