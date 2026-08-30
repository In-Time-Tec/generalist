import { SqliteRunActivation } from "tenetkit/runtime/sql-driver"

/** @experimental Transaction-local callback which arms the shared host alarm. */
export type Rearm = SqliteRunActivation.Rearm

/** @experimental Create the adapter-owned activation schema. */
export const createSchema: typeof SqliteRunActivation.createSchema = SqliteRunActivation.createSchema

/** @experimental Construct the portable projection implementation over the current SQL transaction. */
export const makeProjection: typeof SqliteRunActivation.makeProjection = SqliteRunActivation.makeProjection

/** @experimental Create, backfill, and arm adapter candidates in the caller's transaction. */
export const initialize: typeof SqliteRunActivation.initialize = SqliteRunActivation.initialize

/** @experimental Earliest TenetKit-owned wake, for use by a host-owned coexistence rearm. */
export const nextDueAt: typeof SqliteRunActivation.nextDueAt = SqliteRunActivation.nextDueAt

export { drain, type DrainOptions, type DrainResult } from "./drain.js"
