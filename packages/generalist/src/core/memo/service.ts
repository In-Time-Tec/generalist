import { Clock, Context, Duration, Effect, Layer, Option, Ref } from "effect"

export interface Provenance {
  readonly fromRun: string
  readonly fromOperation: string
}

export interface Entry extends Provenance {
  readonly value: unknown
  readonly expiresAtMillis: number
}

export interface StoreService {
  readonly get: (key: string) => Effect.Effect<Option.Option<Entry>>
  readonly put: (key: string, entry: Entry) => Effect.Effect<void>
  readonly modelsEnabled: boolean
}

export class Store extends Context.Service<Store, StoreService>()("generalist/core/memo/service/Store") {}

export interface DependencyService {
  readonly tenant: string
  readonly capabilityScope: string
  readonly version: (name: string) => Effect.Effect<string>
}

export class Dependencies extends Context.Service<Dependencies, DependencyService>()(
  "generalist/core/memo/service/Dependencies",
) {}

export interface DependencyOptions {
  readonly tenant: string
  readonly capabilityScope: string
  readonly versions: Readonly<Record<string, string>>
}

export const layerDependencies = (options: DependencyOptions): Layer.Layer<Dependencies> =>
  Layer.succeed(
    Dependencies,
    Dependencies.of({
      tenant: options.tenant,
      capabilityScope: options.capabilityScope,
      version: (name) => Effect.succeed(options.versions[name] ?? ""),
    }),
  )

export interface ModelsOptions {
  readonly enabled: boolean
}

export interface Models {
  readonly enabled: boolean
}

export const models = (options: ModelsOptions): Models => ({ enabled: options.enabled })

export interface LayerOptions {
  readonly models?: Models
}

export const layerMemory = (options: LayerOptions = {}): Layer.Layer<Store> =>
  Layer.effect(
    Store,
    Effect.gen(function* () {
      const entries = yield* Ref.make(new Map<string, Entry>())
      return Store.of({
        modelsEnabled: options.models?.enabled === true,
        get: (key) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis
            return yield* Ref.modify(entries, (current) => {
              const entry = current.get(key)
              if (entry === undefined) return [Option.none<Entry>(), current]
              if (entry.expiresAtMillis > now) return [Option.some(entry), current]
              const next = new Map(current)
              next.delete(key)
              return [Option.none<Entry>(), next]
            })
          }),
        put: (key, entry) => Ref.update(entries, (current) => new Map(current).set(key, entry)),
      })
    }),
  )

export const expiresAt = (ttl: Duration.Input): Effect.Effect<number> =>
  Effect.map(Clock.currentTimeMillis, (now) => now + Duration.toMillis(Duration.fromInputUnsafe(ttl)))
