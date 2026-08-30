import { Config, Layer, Redacted } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { MysqlClient } from "@effect/sql-mysql2"
import { layerSqlRuntime, type SqlRuntimeServices } from "tenetkit/runtime/sql-driver"
import { mysqlDriver, type StoreError, type Options } from "../store/implementation.js"

export type { Options }

export const layer = (
  options: Options,
): Layer.Layer<SqlRuntimeServices, StoreError | SqlError | Config.ConfigError> => {
  const maxConnections = options.maxConnections ?? 10
  const client = MysqlClient.layer({
    url: Redacted.make(options.url),
    maxConnections,
  })
  const normalized = { ...options, maxConnections }
  return layerSqlRuntime({ options: normalized, workerId: "mysql", driver: mysqlDriver(normalized) }).pipe(
    Layer.provide(client),
  )
}
