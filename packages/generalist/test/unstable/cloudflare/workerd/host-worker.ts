import { Crypto, Deferred, Effect, Layer, PlatformError, Scope } from "effect"
import type { Bucket } from "../../../../src/durability/r2.js"
import { RunStore } from "../../../../src/runtime/run/store.js"
import { Runtime } from "../../../../src/runtime/service.js"
import {
  layerRunStore,
  make,
  reconcile,
  type AlarmStorage,
  type Host,
} from "../../../../src/unstable/cloudflare/durable-objects/index.js"
import { admission, options, resolverLayer } from "../durable-objects/fixture.js"

interface ObjectId {
  readonly toString: () => string
}

interface ObjectNamespace {
  readonly idFromName: (name: string) => ObjectId
  readonly get: (id: ObjectId) => { readonly fetch: (request: Request) => Promise<Response> }
}

interface Env {
  readonly OBJECTS: ObjectNamespace
  readonly BUCKET: Bucket
}

interface State {
  readonly storage: AlarmStorage & {
    readonly get: (key: string) => Promise<number | undefined>
    readonly put: (key: string, value: number) => Promise<void>
  }
}

const cryptoLayer = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.tryPromise({
        try: () => crypto.subtle.digest(algorithm, new Uint8Array(data)),
        catch: (cause) => PlatformError.systemError({ module: "Crypto", method: "digest", _tag: "Unknown", cause }),
      }).pipe(Effect.map((buffer) => new Uint8Array(buffer))),
  }),
)

export class AlarmRuntimeObject {
  private readonly scope = Scope.makeUnsafe()
  private readonly host: Promise<Host>
  private readonly release = Deferred.makeUnsafe<void>()
  private held = false
  private doorbell: "native" | "lost" | "failed" = "native"

  constructor(
    private readonly state: State,
    private readonly env: Env,
  ) {
    const dispatch = Effect.gen({ self: this }, function* () {
      const previous = yield* Effect.promise(() => state.storage.get("visits"))
      yield* Effect.promise(() => state.storage.put("visits", (previous ?? 0) + 1))
      if (this.held) yield* Deferred.await(this.release)
    })
    const storage: AlarmStorage = {
      getAlarm: () => state.storage.getAlarm(),
      setAlarm: (time) => {
        if (this.doorbell === "failed") return Promise.reject(new Error("injected native scheduling failure"))
        if (this.doorbell === "lost") return Promise.resolve()
        return state.storage.setAlarm(time)
      },
    }
    this.host = Effect.runPromise(
      Effect.gen(function* () {
        const dependencies = yield* Layer.build(Layer.merge(cryptoLayer, resolverLayer(dispatch)))
        return yield* make({ ...options, bucket: env.BUCKET, storage }).pipe(Effect.provideContext(dependencies))
      }).pipe(Scope.provide(this.scope)),
    )
  }

  alarm(): Promise<void> {
    return Effect.runPromise(
      Effect.gen({ self: this }, function* () {
        const previous = yield* Effect.promise(() => this.state.storage.get("alarms"))
        yield* Effect.promise(() => this.state.storage.put("alarms", (previous ?? 0) + 1))
        const host = yield* Effect.promise(() => this.host)
        yield* host.alarm
        const completed = yield* Effect.promise(() => this.state.storage.get("completedAlarms"))
        yield* Effect.promise(() => this.state.storage.put("completedAlarms", (completed ?? 0) + 1))
      }),
    )
  }

  fetch(request: Request): Promise<Response> {
    return Effect.runPromise(
      Effect.scoped(
        Effect.gen({ self: this }, function* () {
          const url = new URL(request.url)
          const key = url.searchParams.get("key") ?? "run"
          if (url.pathname === "/status") {
            const context = yield* Layer.build(
              layerRunStore({ ...options, bucket: this.env.BUCKET }).pipe(Layer.provide(cryptoLayer)),
            )
            const run = yield* Effect.flatMap(RunStore, (store) => store.inspect(key)).pipe(
              Effect.provideContext(context),
            )
            const objects = yield* Effect.promise(() => this.env.BUCKET.list({ prefix: "environments/" }))
            return Response.json({
              status: run.status,
              visits: (yield* Effect.promise(() => this.state.storage.get("visits"))) ?? 0,
              alarms: (yield* Effect.promise(() => this.state.storage.get("alarms"))) ?? 0,
              completedAlarms: (yield* Effect.promise(() => this.state.storage.get("completedAlarms"))) ?? 0,
              alarm: yield* Effect.promise(() => this.state.storage.getAlarm()),
              objects: objects.objects.length,
            })
          }
          if (url.pathname === "/release") {
            this.held = false
            yield* Deferred.succeed(this.release, undefined)
            return Response.json({ released: true })
          }
          const host = yield* Effect.promise(() => this.host)
          if (url.pathname === "/admit") {
            const mode = url.searchParams.get("mode")
            this.doorbell = mode === "lost" || mode === "failed" ? mode : "native"
            if (mode === "held") this.held = true
            const receipt = yield* host.run(Effect.flatMap(Runtime, (runtime) => runtime.send(admission(key))))
            return Response.json(receipt)
          }
          if (url.pathname === "/notify") {
            this.doorbell = "native"
            yield* host.run(Effect.void)
            return Response.json({ notified: true })
          }
          if (url.pathname === "/duplicate") {
            yield* Effect.all([host.alarm, host.alarm], { concurrency: "unbounded" })
            return Response.json({ drained: true })
          }
          return new Response("not found", { status: 404 })
        }),
      ),
    )
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/reconcile") {
      return Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            let dispatches = 0
            const dependencies = yield* Layer.build(
              Layer.merge(
                cryptoLayer,
                resolverLayer(
                  Effect.sync(() => {
                    dispatches += 1
                  }),
                ),
              ),
            )
            const result = yield* reconcile({ ...options, bucket: env.BUCKET }).pipe(
              Effect.provideContext(dependencies),
            )
            return Response.json({ ...result, dispatches })
          }),
        ),
      )
    }
    return env.OBJECTS.get(env.OBJECTS.idFromName("host")).fetch(request)
  },
}
