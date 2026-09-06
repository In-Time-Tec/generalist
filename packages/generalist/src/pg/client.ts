import { Redacted } from "effect"
import { layerClientPool } from "./client-pool.js"

export interface PostgresClientOptions {
  readonly url: string
  readonly maxConnections?: number
}

export const layerClient = (options: PostgresClientOptions) =>
  layerClientPool({
    url: Redacted.make(options.url),
    ...(options.maxConnections === undefined ? undefined : { maxConnections: options.maxConnections }),
  })
