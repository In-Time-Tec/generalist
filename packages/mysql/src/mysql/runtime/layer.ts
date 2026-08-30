import { Config, Layer, Redacted } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { MysqlClient } from "@effect/sql-mysql2"
import { layerSqlRuntime, type SqlRuntimeServices } from "tenetkit/runtime/sql-driver"
import { ExecutableResolver } from "tenetkit/runtime"
import { mysqlDriver, type RuntimeError, type Options } from "../store/implementation.js"

export type { Options }

export const layer = (
  options: Options,
): Layer.Layer<
  SqlRuntimeServices,
  RuntimeError | SqlError | Config.ConfigError,
  ExecutableResolver.ExecutableResolver
> => {
  const maxConnections = options.maxConnections ?? 10
  const client = MysqlClient.layer({
    url: Redacted.make(options.url),
    maxConnections,
  })
  const normalized = { ...options, maxConnections }
  return layerSqlRuntime({ options: normalized, driver: mysqlDriver(normalized) }).pipe(Layer.provide(client))
}
