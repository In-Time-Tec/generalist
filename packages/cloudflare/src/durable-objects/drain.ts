import { SqliteRunActivation } from "tenetkit/runtime/sql-driver"

/** @experimental */
export type DrainOptions = SqliteRunActivation.DrainOptions

/** @experimental */
export type DrainResult = SqliteRunActivation.DrainResult

/** @experimental Drain a deterministic bounded batch; claiming follows candidate reads. */
export const drain: typeof SqliteRunActivation.drain = SqliteRunActivation.drain
