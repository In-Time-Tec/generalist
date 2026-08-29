# @tenetkit/pg

PostgreSQL runtime backend for TenetKit.

## Shared client

`layer(options)` uses a caller-supplied Effect `PgClient`. Provide the same client Layer to the host so host SQL and TenetKit Runtime operations share one transaction service:

```ts
import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { layer } from "@tenetkit/pg"
import { Run, Runtime } from "tenetkit/runtime"

declare const options: Parameters<typeof layer>[0]
declare const admission: Runtime.AdmitInput

const client = PgClient.layer({ url: Redacted.make("postgres://localhost/app") })
const app = layer(options).pipe(Layer.provideMerge(client))

const admitWithHostRow = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const runtime = yield* Runtime.Runtime
  const receipt: Run.RunReceipt = yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`INSERT INTO host_jobs (id) VALUES (${admission.idempotencyKey})`
      return yield* runtime.admit(admission)
    }),
  )
  return receipt
}).pipe(Effect.provide(app))
```

Runtime admission nests through the exact same Effect SQL transaction service, so nested use keeps Effect SQL savepoint behavior. PostgreSQL notifications run on that transaction connection and become visible only after the outermost commit; rollback removes both host and Runtime rows without emitting a notification.

`layer(options)` accepts either URL-backed `UrlOptions` or `Options` with a caller-provided client. Schema deployment stays separate through `RunSchema.plan`, `RunSchema.check`, and `RunSchema.apply`.
