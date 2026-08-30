# @tenetkit/pg

PostgreSQL runtime backend for TenetKit.

```bash
bun add effect@4.0.0-rc.112 tenetkit@0.44.0 @tenetkit/pg@0.44.0
```

`layer(options)` supports Node 22+ and Bun 1.4+. Pass URL options to let the adapter acquire its client, or provide an Effect `PgClient` for shared transactions. Import `RuntimeSchema` from this package for predeploy schema work.

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

`layer(options)` accepts either URL-backed `UrlOptions` or `Options` with a caller-provided client. Install and import `@effect/sql-pg` directly when using the shared-client form shown above. Schema deployment stays separate through `RuntimeSchema.plan`, `RuntimeSchema.check`, and `RuntimeSchema.apply`.
