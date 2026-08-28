import { Redacted } from "effect"
import { PgClient } from "@effect/sql-pg"
import { TypeOverrides, types } from "pg"

const postgresTypes = new TypeOverrides()

postgresTypes.setTypeParser(types.builtins.INT8, (value) => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed))
    throw new RangeError(`PostgreSQL BIGINT is outside JavaScript's safe integer range: ${value}`)
  return parsed
})

export interface PostgresClientOptions {
  readonly url: string
  readonly maxConnections?: number
}

export const layerClient = (options: PostgresClientOptions) =>
  PgClient.layer({
    url: Redacted.make(options.url),
    types: postgresTypes,
    ...(options.maxConnections === undefined ? undefined : { maxConnections: options.maxConnections }),
  })
