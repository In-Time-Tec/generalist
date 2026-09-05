import { PgClient } from "@effect/sql-pg"
import { Cause, Duration, Effect, Exit, Redacted, Stream } from "effect"
import type { Connection } from "effect/unstable/sql/SqlConnection"
import { ConnectionError, SqlError, UnknownError } from "effect/unstable/sql/SqlError"
import { Client, Pool } from "pg"
import Cursor from "pg-cursor"
import { Reactivity } from "effect/unstable/reactivity"

/** A PostgreSQL pool whose scoped connections are discarded on interruption or failed transactions. */
export const makeClient = (config: PgClient.PgPoolConfig) =>
  Effect.gen(function* () {
    const pool = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new Pool({
            connectionString: config.url === undefined ? undefined : Redacted.value(config.url),
            host: config.path ?? config.host,
            ...(config.stream === undefined ? undefined : { stream: config.stream }),
            port: config.port,
            user: config.username,
            password: config.password === undefined ? undefined : Redacted.value(config.password),
            database: config.database,
            ssl: config.ssl,
            types: config.types,
            application_name: config.applicationName,
            max: config.maxConnections,
            min: config.minConnections,
            connectionTimeoutMillis: Duration.toMillis(config.connectTimeout ?? "5 seconds"),
            idleTimeoutMillis: Duration.toMillis(config.idleTimeout ?? "10 seconds"),
            maxLifetimeSeconds: config.connectionTTL === undefined ? 0 : Duration.toMillis(config.connectionTTL) / 1000,
          }),
      ),
      (resource) => Effect.promise(() => resource.end()),
    )
    pool.on("error", () => {})
    const reactivity = yield* Reactivity.Reactivity
    const acquire = Effect.gen(function* () {
      let released = false
      const raw = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => pool.connect(),
          catch: (cause) => SqlError.make({ reason: ConnectionError.make({ cause, operation: "acquire" }) }),
        }),
        (client, exit) =>
          Effect.sync(() => {
            if (!released) {
              released = true
              client.release(Exit.isFailure(exit))
            }
          }),
      )
      const discard = Effect.sync(() => {
        if (!released) {
          released = true
          raw.release(true)
        }
      })
      const client = yield* PgClient.fromClient({ acquire: Effect.succeed(raw), acquireForStream: true }).pipe(
        Effect.provideService(Reactivity.Reactivity, reactivity),
      )
      const connection = yield* client.reserve
      const protect = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(Effect.onInterrupt(() => discard))
      return {
        execute: (...args) => protect(connection.execute(...args)),
        executeRaw: (...args) => protect(connection.executeRaw(...args)),
        executeUnprepared: (...args) => protect(connection.executeUnprepared(...args)),
        executeValues: (...args) => protect(connection.executeValues(...args)),
        executeValuesUnprepared: (...args) => protect(connection.executeValuesUnprepared(...args)),
        executeStream: (sql, params, transformRows) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const cursor = yield* Effect.acquireRelease(
                Effect.sync(() => raw.query(new Cursor(sql, [...params]))),
                (resource) => Effect.suspend(() => (released ? Effect.void : Effect.promise(() => resource.close()))),
              )
              const pull = Effect.callback<readonly [object, ...Array<object>], SqlError | Cause.Done>((resume) => {
                cursor.read(128, (cause, rows: Array<object>) => {
                  if (cause !== undefined && cause !== null)
                    resume(Effect.fail(SqlError.make({ reason: UnknownError.make({ cause, operation: "stream" }) })))
                  else if (rows.length === 0) resume(Cause.done())
                  else {
                    const transformed = transformRows === undefined ? rows : transformRows(rows)
                    const [first, ...rest] = transformed
                    if (first === undefined) resume(Cause.done())
                    else resume(Effect.succeed([first, ...rest]))
                  }
                })
              }).pipe(Effect.onError(() => discard))
              return Stream.fromPull(Effect.succeed(pull))
            }),
          ),
      } satisfies Connection
    })
    const listener = Effect.gen(function* () {
      const client = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const resource = new Client(pool.options)
          resource.on("error", () => {})
          return resource
        }),
        (resource) => Effect.promise(() => resource.end()),
      )
      yield* Effect.tryPromise({
        try: () => client.connect(),
        catch: (cause) => SqlError.make({ reason: ConnectionError.make({ cause, operation: "listen" }) }),
      })
      return client
    })
    return yield* PgClient.makeWith({
      acquirer: acquire,
      transactionAcquirer: acquire,
      listenAcquirer: listener,
      config,
      spanAttributes: config.spanAttributes,
      transformResultNames: config.transformResultNames,
      transformQueryNames: config.transformQueryNames,
      transformJson: config.transformJson,
    })
  })

/** Provide the scoped PostgreSQL client and Effect SQL services. */
export const layerClientPool = (config: PgClient.PgPoolConfig) => PgClient.layerFrom(makeClient(config))
