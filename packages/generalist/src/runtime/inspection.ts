import { Context, Crypto, Effect, Layer, Schema } from "effect"
import { Remaining as RemainingBudget } from "../core/durable/run-budget.js"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import type { DurabilityFailure } from "../durability/errors.js"
import { readOnlyRuntimeState } from "../durability/internal/inspection/read-only-runtime.js"
import { ObjectStore, type Service as ObjectStoreService } from "../durability/object-store.js"
import {
  projectInspectionRun,
  projectInspectionSession,
  type InspectionProjectionFailure,
} from "./state/inspection/projection.js"
import type { Namespace } from "./composition.js"

/** Opaque continuation returned by bounded inspection pages. @experimental */
export const Cursor = Schema.String.check(Schema.isMaxLength(65_536))
export type Cursor = typeof Cursor.Type

/** Product-facing Run lifecycle without recovery-only intermediate states. @experimental */
export const RunStatus = Schema.Literals(["pending", "running", "waiting", "succeeded", "failed", "cancelled"])
export type RunStatus = typeof RunStatus.Type

/** Bounded token totals reconstructed from canonical Run events. @experimental */
export const Usage = Schema.Struct({
  inputTokens: Schema.Finite,
  outputTokens: Schema.Finite,
})
export type Usage = typeof Usage.Type

/** Remaining user-facing Run limits. @experimental */
export const Budget = RemainingBudget
export type Budget = typeof Budget.Type

/** Public identity and kind of one open Run wait. @experimental */
export const Wait = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["approval", "signal", "tool", "child", "external"]),
  openedAtSequence: Schema.Int,
})
export type Wait = typeof Wait.Type

/** Bounded direct-child status without execution authority. @experimental */
export const Child = Schema.Struct({
  childRunId: Schema.String,
  agent: Schema.String,
  status: RunStatus,
  readiness: Schema.Literals(["admitted", "active", "terminal"]),
  invocationId: Schema.optionalKey(Schema.String),
})
export type Child = typeof Child.Type

/** Read-only Run projection reconstructed from one storage namespace. @experimental */
export const Run = Schema.Struct({
  runId: Schema.String,
  sessionId: Schema.String,
  rootRunId: Schema.String,
  parentRunId: Schema.optionalKey(Schema.String),
  agent: Schema.String,
  revision: Schema.String,
  status: RunStatus,
  durability: Schema.Literals(["ephemeral", "durable"]),
  depth: Schema.Int,
  turn: Schema.Int,
  lastSequence: Schema.Int,
  usage: Usage,
  budget: Budget,
  waits: Schema.Array(Wait).check(Schema.isMaxLength(200)),
  children: Schema.Array(Child).check(Schema.isMaxLength(200)),
})
export type Run = typeof Run.Type

/** Read-only Session summary reconstructed from one storage namespace. @experimental */
export const Session = Schema.Struct({
  sessionId: Schema.String,
  title: Schema.optionalKey(Schema.String),
  createdAt: Schema.String,
  lifecycle: Schema.Literals(["active", "stopped", "closed"]),
  activeRunId: Schema.optionalKey(Schema.String),
  queuedInputs: Schema.Int,
  runCount: Schema.Int,
})
export type Session = typeof Session.Type

/** Schema constructor for an inspection page of at most 200 items. @experimental */
export const Page = <Value extends Schema.Top>(value: Value) =>
  Schema.Struct({
    items: Schema.Array(value).check(Schema.isMaxLength(200)),
    cursor: Schema.optionalKey(Cursor),
  })
/** One bounded inspection page. @experimental */
export interface Page<Value> {
  readonly items: ReadonlyArray<Value>
  readonly cursor?: Cursor
}

const NamespaceSchema = Schema.Struct({
  environment: Schema.String,
  tenant: Schema.String,
  partition: Schema.String,
})

/** Public committed or uncommitted partition summary. @experimental */
export const PartitionInspection = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("uncommitted"),
    namespace: NamespaceSchema,
  }),
  Schema.Struct({
    status: Schema.Literal("committed"),
    namespace: NamespaceSchema,
    cursor: Cursor,
    runCount: Schema.Int,
    sessionCount: Schema.Int,
  }),
])
export type PartitionInspection = typeof PartitionInspection.Type

/** Required inspection page bound and optional opaque continuation. @experimental */
export const PageInput = Schema.Struct({
  cursor: Schema.optionalKey(Cursor),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
})
export type PageInput = typeof PageInput.Type

/** The authorized namespace contains no Run with this identity. @experimental */
export class RunNotFound extends ActionableTaggedError<RunNotFound>()("generalist/inspection/RunNotFound", {
  runId: Schema.String,
  hint: errorHint("Check the Run identity and the namespace authorized for this Inspection service."),
}) {}

/** The authorized namespace contains no Session with this identity. @experimental */
export class SessionNotFound extends ActionableTaggedError<SessionNotFound>()("generalist/inspection/SessionNotFound", {
  sessionId: Schema.String,
  hint: errorHint("Check the Session identity and the namespace authorized for this Inspection service."),
}) {}

/** Storage could not complete a bounded inspection read. @experimental */
export class InspectionUnavailable extends ActionableTaggedError<InspectionUnavailable>()(
  "generalist/inspection/InspectionUnavailable",
  {
    namespace: NamespaceSchema,
    operation: Schema.Literals(["read", "list"]),
    hint: errorHint("Retry after restoring bounded read and list access to the namespace's object storage."),
  },
) {}

/** Canonical storage failed inspection validation. @experimental */
export class InspectionCorrupt extends ActionableTaggedError<InspectionCorrupt>()(
  "generalist/inspection/InspectionCorrupt",
  {
    namespace: NamespaceSchema,
    record: Schema.String,
    reason: Schema.Literals(["digest", "schema", "ordering", "reference"]),
    hint: errorHint("Restore the canonical namespace from verified retained objects; inspection cannot repair it."),
  },
) {}

/** An inspection continuation is unusable for this namespace and snapshot. @experimental */
export class InspectionCursorInvalid extends ActionableTaggedError<InspectionCursorInvalid>()(
  "generalist/inspection/InspectionCursorInvalid",
  {
    cursor: Schema.String,
    reason: Schema.Literals(["malformed", "expired", "wrong-namespace", "future"]),
    hint: errorHint("Restart pagination without a cursor and retain the next opaque cursor unchanged."),
  },
) {}

/** A requested inspection page bound is outside 1 through 200. @experimental */
export class InspectionLimitInvalid extends ActionableTaggedError<InspectionLimitInvalid>()(
  "generalist/inspection/InspectionLimitInvalid",
  {
    // oxlint-disable-next-line effecttsgo/schema-number -- The failure must retain non-finite invalid inputs.
    limit: Schema.Number,
    minimum: Schema.Literal(1),
    maximum: Schema.Literal(200),
    hint: errorHint("Choose a safe integer page limit from 1 through 200."),
  },
) {}

/** Failures shared by read-only inspection methods. @experimental */
export type InspectionFailure =
  | InspectionUnavailable
  | InspectionCorrupt
  | InspectionCursorInvalid
  | InspectionLimitInvalid

/** Read-only operations fixed to one authorized namespace. @experimental */
export interface Service {
  readonly run: (runId: string) => Effect.Effect<Run, RunNotFound | InspectionFailure>
  readonly session: (sessionId: string) => Effect.Effect<Session, SessionNotFound | InspectionFailure>
  readonly runs: (input: PageInput) => Effect.Effect<Page<Run>, InspectionFailure>
  readonly sessions: (input: PageInput) => Effect.Effect<Page<Session>, InspectionFailure>
  readonly partition: Effect.Effect<PartitionInspection, InspectionFailure>
}

/** Read-only namespace inspection service. @experimental */
export class Inspection extends Context.Service<Inspection, Service>()("generalist/runtime/inspection") {}

/** Storage and fixed namespace used by an Inspection Layer. @experimental */
export interface Options<StorageError, StorageRequirements> {
  readonly storage: Layer.Layer<ObjectStore | Crypto.Crypto, StorageError, StorageRequirements>
  readonly namespace: Namespace
}

const CursorPayload = Schema.Struct({
  version: Schema.Literal(1),
  namespace: NamespaceSchema,
  collection: Schema.Literals(["runs", "sessions"]),
  sequence: Schema.String.check(Schema.isPattern(/^-?\d+$/)),
  offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
const CursorPayloadJson = Schema.fromJsonString(CursorPayload)

type CursorPayload = typeof CursorPayload.Type
type Collection = CursorPayload["collection"]

const cursorInvalid = (cursor: string, reason: InspectionCursorInvalid["reason"]) =>
  InspectionCursorInvalid.make({ cursor, reason })

const encodeCursor = (payload: CursorPayload): Cursor =>
  encodeURIComponent(Schema.encodeSync(CursorPayloadJson)(payload))

const decodeCursor = (cursor: string): Effect.Effect<CursorPayload, InspectionCursorInvalid> =>
  cursor.length > 65_536
    ? Effect.fail(cursorInvalid(cursor, "malformed"))
    : Effect.try({
        try: () => decodeURIComponent(cursor),
        catch: () => cursorInvalid(cursor, "malformed"),
      }).pipe(
        Effect.flatMap(Schema.decodeEffect(CursorPayloadJson, { onExcessProperty: "error" })),
        Effect.mapError(() => cursorInvalid(cursor, "malformed")),
      )

const sameNamespace = (left: Namespace, right: Namespace): boolean =>
  left.environment === right.environment && left.tenant === right.tenant && left.partition === right.partition

const compareSequence = (left: string, right: string): number => {
  const leftValue = BigInt(left)
  const rightValue = BigInt(right)
  if (leftValue < rightValue) return -1
  return leftValue > rightValue ? 1 : 0
}

const corruptionReason = (failure: DurabilityFailure): InspectionCorrupt["reason"] => {
  const detail = `${failure.message} ${failure.key ?? ""}`.toLowerCase()
  if (detail.includes("digest") || detail.includes("hash") || detail.includes("canonical bytes")) return "digest"
  if (
    detail.includes("ordering") ||
    detail.includes("sequence") ||
    detail.includes("history contains a gap") ||
    detail.includes("did not advance")
  )
    return "ordering"
  if (
    detail.includes("reference") ||
    detail.includes("missing") ||
    detail.includes("parent") ||
    detail.includes("leaf") ||
    detail.includes("anchor")
  )
    return "reference"
  return "schema"
}

const mapDurabilityFailure =
  (namespace: Namespace) =>
  (failure: DurabilityFailure): InspectionFailure => {
    if (failure.reason === "corruption" || failure.reason === "unsupported-version" || failure.reason === "encoding") {
      return InspectionCorrupt.make({
        namespace,
        record: failure.key ?? "runtime-state",
        reason: corruptionReason(failure),
      })
    }
    return InspectionUnavailable.make({
      namespace,
      operation: failure.cause?.operation === "list" ? "list" : "read",
    })
  }

const mapProjectionFailure = (namespace: Namespace) => (failure: InspectionProjectionFailure) =>
  InspectionCorrupt.make({ namespace, ...failure })

const validateLimit = (limit: number): Effect.Effect<void, InspectionLimitInvalid> =>
  Number.isSafeInteger(limit) && limit >= 1 && limit <= 200
    ? Effect.void
    : Effect.fail(InspectionLimitInvalid.make({ limit, minimum: 1, maximum: 200 }))

const pageOffset = (
  namespace: Namespace,
  collection: Collection,
  sequence: string,
  cursor: string | undefined,
  size: number,
): Effect.Effect<number, InspectionCursorInvalid> =>
  Effect.gen(function* () {
    if (cursor === undefined) return 0
    const payload = yield* decodeCursor(cursor)
    if (!sameNamespace(namespace, payload.namespace)) return yield* cursorInvalid(cursor, "wrong-namespace")
    if (payload.collection !== collection) return yield* cursorInvalid(cursor, "malformed")
    const compared = compareSequence(payload.sequence, sequence)
    if (compared < 0) return yield* cursorInvalid(cursor, "expired")
    if (compared > 0 || payload.offset > size) return yield* cursorInvalid(cursor, "future")
    return payload.offset
  })

const paginate = <Value>(input: {
  readonly namespace: Namespace
  readonly collection: Collection
  readonly sequence: string
  readonly values: ReadonlyArray<Value>
  readonly cursor?: string
  readonly limit: number
}): Effect.Effect<Page<Value>, InspectionCursorInvalid> =>
  Effect.gen(function* () {
    const offset = yield* pageOffset(
      input.namespace,
      input.collection,
      input.sequence,
      input.cursor,
      input.values.length,
    )
    const items = input.values.slice(offset, offset + input.limit)
    const next = offset + items.length
    if (next >= input.values.length) return { items }
    return {
      items,
      cursor: encodeCursor({
        version: 1,
        namespace: input.namespace,
        collection: input.collection,
        sequence: input.sequence,
        offset: next,
      }),
    }
  })

const makeService = (namespace: Namespace, store: ObjectStoreService, crypto: Crypto.Crypto): Service => {
  const read = readOnlyRuntimeState(namespace).pipe(
    Effect.provideService(ObjectStore, store),
    Effect.provideService(Crypto.Crypto, crypto),
    Effect.mapError(mapDurabilityFailure(namespace)),
  )
  return Inspection.of({
    run: (runId) =>
      Effect.gen(function* () {
        const { state } = yield* read
        if (state === undefined) return yield* RunNotFound.make({ runId })
        const source = state.runs.get(runId)
        if (source === undefined) return yield* RunNotFound.make({ runId })
        return yield* projectInspectionRun(state, source).pipe(Effect.mapError(mapProjectionFailure(namespace)))
      }),
    session: (sessionId) =>
      Effect.gen(function* () {
        const { state } = yield* read
        if (state === undefined || !state.hostSessions.has(sessionId)) {
          return yield* SessionNotFound.make({ sessionId })
        }
        return yield* projectInspectionSession(state, sessionId).pipe(Effect.mapError(mapProjectionFailure(namespace)))
      }),
    runs: (input) =>
      validateLimit(input.limit).pipe(
        Effect.andThen(read),
        Effect.flatMap(({ sequence, state }) =>
          Effect.gen(function* () {
            if (state === undefined) {
              return yield* paginate({ namespace, collection: "runs", sequence, values: [], ...input })
            }
            const sources = [...state.runs.values()].toSorted((left, right) => left.runId.localeCompare(right.runId))
            const sourcePage = yield* paginate({ namespace, collection: "runs", sequence, values: sources, ...input })
            const items = yield* Effect.forEach(sourcePage.items, (run) => projectInspectionRun(state, run), {
              concurrency: 8,
            }).pipe(Effect.mapError(mapProjectionFailure(namespace)))
            return sourcePage.cursor === undefined ? { items } : { items, cursor: sourcePage.cursor }
          }),
        ),
      ),
    sessions: (input) =>
      validateLimit(input.limit).pipe(
        Effect.andThen(read),
        Effect.flatMap(({ sequence, state }) =>
          Effect.gen(function* () {
            if (state === undefined) {
              return yield* paginate({ namespace, collection: "sessions", sequence, values: [], ...input })
            }
            const sourcePage = yield* paginate({
              namespace,
              collection: "sessions",
              sequence,
              values: [...state.hostSessions.keys()].toSorted(),
              ...input,
            })
            const items = yield* Effect.forEach(
              sourcePage.items,
              (sessionId) => projectInspectionSession(state, sessionId),
              { concurrency: 8 },
            ).pipe(Effect.mapError(mapProjectionFailure(namespace)))
            return sourcePage.cursor === undefined ? { items } : { items, cursor: sourcePage.cursor }
          }),
        ),
      ),
    partition: read.pipe(
      Effect.map(
        ({ sequence, state }): PartitionInspection =>
          state === undefined
            ? { status: "uncommitted", namespace }
            : {
                status: "committed",
                namespace,
                cursor: sequence,
                runCount: state.runs.size,
                sessionCount: state.hostSessions.size,
              },
      ),
    ),
  })
}

/** Build read-only Inspection without Agents, a resolver, activation, or scheduling. @experimental */
export const layer = <StorageError, StorageRequirements>(
  options: Options<StorageError, StorageRequirements>,
): Layer.Layer<Inspection, StorageError | InspectionFailure, StorageRequirements> =>
  Layer.effect(
    Inspection,
    Effect.gen(function* () {
      const store = yield* ObjectStore
      const crypto = yield* Crypto.Crypto
      const namespace: Namespace = {
        environment: options.namespace.environment,
        tenant: options.namespace.tenant,
        partition: options.namespace.partition,
      }
      return makeService(namespace, store, crypto)
    }),
  ).pipe(Layer.provide(options.storage))
