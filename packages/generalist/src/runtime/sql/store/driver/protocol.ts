import type { Effect, Semaphore, Stream, Scope } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { ExternalChildStore } from "../../../child/external/store.js"
import type { RunEvent } from "../../../run/event.js"
import type { RunActivationProjection } from "../../../run/activation.js"
import type { Service as RunStoreService, StoreBackend } from "../../../run/store.js"
import type { LayerOptions } from "../../../service.js"
import type {
  MultiWorkerUnsupported,
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
} from "../../errors.js"
import type { RuntimeUnavailable, RunNotFound } from "../../../errors.js"
import type { ClaimedRun } from "../../run/claims.js"
import type { EventHub } from "../../subscribers.js"
import type { WithoutSqlError } from "../../effect.js"

export type SqlStoreRun = <A, E>(
  effect: Effect.Effect<A, E | SqlError, SqlClient.SqlClient>,
) => Effect.Effect<A, WithoutSqlError<E | SqlError> | RuntimeUnavailable>

export interface SqlStoreRunner {
  readonly run: SqlStoreRun
  readonly runNoTransaction: SqlStoreRun
  readonly runInspection: SqlStoreRun
  readonly transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | SqlError, R>
  readonly transactionHub: EventHub
}

export interface SqlStoreLocks {
  readonly run: (runId: string) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
  readonly fence: (runId: string) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
  readonly hierarchy: (runId: string) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
  readonly spawn: (parentRunId: string) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
  readonly admission: (input: {
    readonly address: string
    readonly sessionId: string
    readonly idempotencyKey: string
    readonly runId?: string
  }) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
  readonly admissionRegistrations: Effect.Effect<void, SqlError, SqlClient.SqlClient>
  readonly registrations: Effect.Effect<void, SqlError, SqlClient.SqlClient>
  readonly mailbox: (sessionId: string) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
  readonly fanOut: (input: {
    readonly parentRunId: string
    readonly idempotencyKey: string
  }) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
}

export interface SqlClaimMechanics {
  readonly changes: Stream.Stream<void, RuntimeUnavailable>
  readonly claimReadyRuns: (input: {
    readonly workerId: string
    readonly limit: number
    readonly lease?: import("effect").Duration.Input
  }) => Effect.Effect<
    ReadonlyArray<ClaimedRun & { readonly startedAttempt: boolean }>,
    RuntimeUnavailable | SqlError,
    SqlClient.SqlClient
  >
  readonly refreshLease: (input: {
    readonly runId: string
    readonly workerId: string
    readonly attemptFence: number
    readonly cancellationRequested: boolean
    readonly lease?: import("effect").Duration.Input
  }) => Effect.Effect<boolean, RuntimeUnavailable | SqlError, SqlClient.SqlClient>
}

export interface SqlStoreDriver<Error = never> {
  readonly backend: Exclude<StoreBackend, "memory">
  readonly multiWorker: boolean
  readonly migrate: (source: string) => Effect.Effect<void, Error, SqlClient.SqlClient | Scope.Scope>
  readonly initialize?: (source: string) => Effect.Effect<void, Error, SqlClient.SqlClient | Scope.Scope>
  readonly makeRunner: (input: {
    readonly sql: SqlClient.SqlClient
    readonly hub: EventHub
    readonly eventCommit: Semaphore.Semaphore
    readonly activationProjection?: RunActivationProjection
  }) => SqlStoreRunner
  readonly locks: SqlStoreLocks
  readonly claims?: (input: {
    readonly sql: SqlClient.SqlClient
    readonly hub: EventHub
    readonly transactionHub: EventHub
  }) => SqlClaimMechanics
  readonly events?: (
    input: Parameters<RunStoreService["events"]>[0],
    context: {
      readonly hub: EventHub
      readonly capacity: number
      readonly runNoTransaction: SqlStoreRun
      readonly loadReplay: Effect.Effect<
        { readonly replay: ReadonlyArray<RunEvent>; readonly lastSequence: number },
        RunNotFound | RuntimeUnavailable
      >
      readonly loadAfter: (cursor: number) => Effect.Effect<ReadonlyArray<RunEvent>, RuntimeUnavailable>
    },
  ) => ReturnType<RunStoreService["events"]>
  readonly treeChanges?: (
    rootRunId: string,
    context: {
      readonly hub: EventHub
      readonly rootForRun: (runId: string) => Effect.Effect<string | undefined, RuntimeUnavailable>
    },
  ) => ReturnType<RunStoreService["treeChanges"]>
}

export type SqlRuntimeDriver<Error> = SqlStoreDriver<Error> & {
  readonly claims: NonNullable<SqlStoreDriver<Error>["claims"]>
}

export interface SqlStoreOptions extends LayerOptions {
  readonly source?: string
}

export interface SqliteStoreOptions extends LayerOptions {
  readonly source?: string
  readonly multiWorker?: boolean
  readonly workers?: number
}

export type SqliteStoreError =
  | SchemaDirty
  | SchemaChecksumMismatch
  | SchemaVersionUnsupported
  | SchemaMigrationFailed
  | MultiWorkerUnsupported

export type SqlDriverStoreError =
  | SchemaDirty
  | SchemaChecksumMismatch
  | SchemaVersionUnsupported
  | SchemaUpgradeRequired
  | SchemaMigrationFailed

export interface SqlStoreServices {
  readonly runStore: RunStoreService
  readonly claims?: import("../../run/claims.js").Service
  readonly externalChildStore: ExternalChildStore["Service"]
}
