import { layerPostgres } from "@tenetkit/pg"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { ExecutableResolver } from "tenetkit/runtime"

const resolver = ExecutableResolver.makeStatic([])

it.effect("rejects invalid PostgreSQL pool bounds before opening a client", () =>
  Effect.gen(function* () {
    for (const maxConnections of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const failure = yield* Layer.build(
        layerPostgres({
          url: "postgres://must-not-connect",
          resolver,
          addresses: [],
          maxConnections,
        }),
      ).pipe(Effect.flip, Effect.scoped)
      expect(failure).toMatchObject({
        _tag: "tenetkit/runtime/SchemaMigrationFailed",
        source: "postgres",
        message: "PostgreSQL maxConnections must be a positive integer",
      })
    }
  }),
)
