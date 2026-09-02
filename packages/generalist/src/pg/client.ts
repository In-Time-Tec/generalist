import { Redacted } from "effect"
import { PgClient } from "@effect/sql-pg"

export interface PostgresClientOptions {
  readonly url: string
  readonly maxConnections?: number
}

export const layerClient = (options: PostgresClientOptions) =>
  PgClient.layer({
    url: Redacted.make(options.url),
    ...(options.maxConnections === undefined ? undefined : { maxConnections: options.maxConnections }),
  })
