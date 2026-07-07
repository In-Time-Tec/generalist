import { Chunk, Context, Effect, Layer, Option, Ref, Schema, Semaphore } from "effect"
import * as Ai from "effect/unstable/ai"

/** @experimental */
export type Metadata = Readonly<Record<string, unknown>>

/** @experimental */
export interface GovernanceOptions {
  readonly maxConcurrentModelCalls?: number
}

/** @experimental */
export interface ModelSelection {
  readonly provider: string
  readonly model: string
  readonly registrationKey?: string
}

/** @experimental */
export class LanguageModelNotRegistered extends Schema.TaggedErrorClass<LanguageModelNotRegistered>()(
  "LanguageModelNotRegistered",
  {
    provider: Schema.String,
    model: Schema.String,
    registration_key: Schema.optionalKey(Schema.String),
  },
) {}

/** @experimental */
export interface Registration {
  readonly provider: string
  readonly model: string
  readonly registrationKey?: string
  readonly layer: Layer.Layer<ModelEnvironment>
  readonly metadata?: Metadata
}

/** @experimental */
export interface RegisterInput {
  readonly registration: Registration
}

/** @experimental */
export interface Interface {
  readonly register: (input: RegisterInput) => Effect.Effect<void>
  readonly registrations: Effect.Effect<ReadonlyArray<Registration>>
  readonly provide: <A, E, R>(
    selection: ModelSelection,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | LanguageModelNotRegistered, Exclude<R, ModelEnvironment>>
}

/** @experimental */
export class Service extends Context.Service<Service, Interface>()("@batonfx/core/ModelRegistry") {}

/** @experimental */
export type ModelEnvironment = Ai.LanguageModel.LanguageModel | Ai.Model.ProviderName | Ai.Model.ModelName
type Registry = Chunk.Chunk<Registration>

const registrationVariantKey = (value: { readonly registrationKey?: string }) => value.registrationKey ?? null

const selectionVariantKey = (selection: ModelSelection) => selection.registrationKey ?? null

const registryIdentity = (registration: Registration) =>
  JSON.stringify([registration.provider, registration.model, registrationVariantKey(registration)])

const matchesSelection = (selection: ModelSelection) => (registration: Registration) =>
  registration.provider === selection.provider &&
  registration.model === selection.model &&
  registrationVariantKey(registration) === selectionVariantKey(selection)

const upsertRegistration = (registry: Registry, registration: Registration) => {
  const key = registryIdentity(registration)
  const exists = Option.isSome(Chunk.findFirst(registry, (item) => registryIdentity(item) === key))
  if (!exists) return Chunk.append(registry, registration)
  return Chunk.map(registry, (item) => (registryIdentity(item) === key ? registration : item))
}

const findRegistration = (registry: Registry, selection: ModelSelection) =>
  Chunk.findFirst(registry, matchesSelection(selection)).pipe(Option.getOrUndefined)

/** @experimental */
export const registrationFromLayer = <R>(input: {
  readonly provider: string
  readonly model: string
  readonly registrationKey?: string
  readonly layer: Layer.Layer<Ai.LanguageModel.LanguageModel, never, R>
  readonly metadata?: Metadata
}) =>
  Ai.Model.make(input.provider, input.model, input.layer).captureRequirements.pipe(
    Effect.map(
      (layer): Registration => ({
        provider: input.provider,
        model: input.model,
        layer,
        ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      }),
    ),
  )

/** @experimental */
export const layer = (initialRegistrations: ReadonlyArray<Registration> = [], options?: GovernanceOptions) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const registry = yield* Ref.make<Registry>(initialRegistrations.reduce(upsertRegistration, Chunk.empty()))

      const semaphore =
        options?.maxConcurrentModelCalls === undefined
          ? undefined
          : yield* Semaphore.make(options.maxConcurrentModelCalls)

      const register = Effect.fn("ModelRegistry.register")(function* (input: RegisterInput) {
        yield* Ref.update(registry, (items) => upsertRegistration(items, input.registration))
      })

      const registrations = Ref.get(registry).pipe(Effect.map(Chunk.toReadonlyArray))

      const provide = Effect.fn("ModelRegistry.provide")(function* <A, E, R>(
        selection: ModelSelection,
        effect: Effect.Effect<A, E, R>,
      ) {
        const items = yield* Ref.get(registry)
        const registration = findRegistration(items, selection)
        if (registration === undefined) {
          return yield* Effect.fail(
            new LanguageModelNotRegistered({
              provider: selection.provider,
              model: selection.model,
              ...(selection.registrationKey === undefined ? {} : { registration_key: selection.registrationKey }),
            }),
          )
        }
        const provided = effect.pipe(Effect.provide(registration.layer))
        return yield* semaphore === undefined ? provided : semaphore.withPermits(1)(provided)
      })

      return Service.of({
        register,
        registrations,
        provide,
      })
    }),
  )

/** @experimental */
export const layerFromRegistrationEffects = <E, R>(
  registrations: ReadonlyArray<Effect.Effect<Registration, E, R>>,
  options?: GovernanceOptions,
) => Layer.unwrap(Effect.all(registrations).pipe(Effect.map((items) => layer(items, options))))

/** @experimental */
export const combine = <E = never, R = never>(
  registries: ReadonlyArray<Layer.Layer<Service, E, R>>,
  options?: GovernanceOptions,
): Layer.Layer<Service, E, R> =>
  Layer.unwrap(
    Effect.forEach(registries, (registry) =>
      Layer.build(registry).pipe(Effect.flatMap((context) => Context.get(context, Service).registrations)),
    ).pipe(Effect.map((groups) => layer(groups.flat(), options))),
  )

/** @experimental */
export const memoryLayer = layer

/** @experimental */
export const testLayer = (implementation: Interface) => Layer.succeed(Service, Service.of(implementation))

/** @experimental */
export const register = Effect.fn("ModelRegistry.register.call")(function* (input: RegisterInput) {
  const service = yield* Service
  return yield* service.register(input)
})

/** @experimental */
export const registrations = Effect.fn("ModelRegistry.registrations.call")(function* () {
  const service = yield* Service
  return yield* service.registrations
})

/** @experimental */
export const provide = <A, E, R>(selection: ModelSelection, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const service = yield* Service
    return yield* service.provide(selection, effect)
  })
