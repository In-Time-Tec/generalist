import { SqliteRunActivation } from "tenetkit/runtime/sql-driver"

/** @experimental Transaction-local callback which arms the shared host alarm. */
export type Rearm = SqliteRunActivation.Rearm

/** @experimental Adapter-owned activation schema. */
export const schema: typeof SqliteRunActivation.schema = SqliteRunActivation.schema

/** @experimental Construct the portable projection implementation over the current SQL transaction. */
export const makeProjection: typeof SqliteRunActivation.makeProjection = SqliteRunActivation.makeProjection

/** @experimental Create, backfill, and arm adapter candidates in the caller's transaction. */
export const migrateAndBackfill: typeof SqliteRunActivation.migrateAndBackfill = SqliteRunActivation.migrateAndBackfill

/** @experimental Earliest TenetKit-owned wake, for use by a host-owned coexistence rearm. */
export const nextDueAt: typeof SqliteRunActivation.nextDueAt = SqliteRunActivation.nextDueAt
