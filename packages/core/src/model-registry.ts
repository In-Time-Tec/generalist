import { Chunk, Context, Effect, Function, Layer, Option, Ref, Schema, Semaphore, Stream } from "effect"
import { LanguageModel, Model } from "effect/unstable/ai"
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
  readonly operate: <A, E, R>(
    selection: ModelSelection,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | LanguageModelNotRegistered, Exclude<R, ModelEnvironment>>
  readonly stream: <A, E, R>(
    selection: ModelSelection,
    stream: Stream.Stream<A, E, R>,
  ) => Stream.Stream<A, E | LanguageModelNotRegistered, Exclude<R, ModelEnvironment>>
  /** @deprecated Use `operate`. */
  readonly provide: <A, E, R>(
    selection: ModelSelection,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | LanguageModelNotRegistered, Exclude<R, ModelEnvironment>>
}

/** @experimental */
export class Service extends Context.Service<Service, Interface>()("@batonfx/core/model-registry/Service") {}

/** @experimental */
export type ModelEnvironment = LanguageModel.LanguageModel | Model.ProviderName | Model.ModelName
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
  readonly layer: Layer.Layer<LanguageModel.LanguageModel, never, R>
  readonly metadata?: Metadata
}) =>
  Model.make(input.provider, input.model, input.layer).captureRequirements.pipe(
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
export const layer: {
  (): Layer.Layer<Service>
  (options?: GovernanceOptions): (initialRegistrations?: ReadonlyArray<Registration>) => Layer.Layer<Service>
  (initialRegistrations?: ReadonlyArray<Registration>, options?: GovernanceOptions): Layer.Layer<Service>
} = Function.dual(
  (args) => args.length === 0 || args.length > 1 || Array.isArray(args[0]),
  (initialRegistrations: ReadonlyArray<Registration> = [], options?: GovernanceOptions) =>
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

        const operate = Effect.fn("ModelRegistry.operate")(function* <A, E, R>(
          selection: ModelSelection,
          effect: Effect.Effect<A, E, R>,
        ) {
          const items = yield* Ref.get(registry)
          const registration = findRegistration(items, selection)
          if (registration === undefined) {
            return yield* LanguageModelNotRegistered.make({
              provider: selection.provider,
              model: selection.model,
              ...(selection.registrationKey === undefined ? {} : { registration_key: selection.registrationKey }),
            })
          }
          const provided = Effect.scoped(
            Layer.build(registration.layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provide(context)))),
          )
          return yield* semaphore === undefined ? provided : semaphore.withPermits(1)(provided)
        })

        const stream = <A, E, R>(selection: ModelSelection, operation: Stream.Stream<A, E, R>) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const items = yield* Ref.get(registry)
              const registration = findRegistration(items, selection)
              if (registration === undefined) {
                return yield* LanguageModelNotRegistered.make({
                  provider: selection.provider,
                  model: selection.model,
                  ...(selection.registrationKey === undefined ? {} : { registration_key: selection.registrationKey }),
                })
              }
              if (semaphore !== undefined) {
                yield* Effect.acquireRelease(semaphore.take(1), () => semaphore.release(1), { interruptible: true })
              }
              const context = yield* Layer.build(registration.layer)
              return operation.pipe(Stream.provideContext(context))
            }),
          )

        return Service.of({
          register,
          registrations,
          operate,
          stream,
          provide: operate,
        })
      }),
    ),
)

/** @experimental */
export const layerFromRegistrationEffects: {
  <E, R>(
    options?: GovernanceOptions,
  ): (
    registrations: ReadonlyArray<Effect.Effect<Registration, E, R>>,
  ) => Layer.Layer<Service, E, Exclude<R, import("effect/Scope").Scope>>
  <E, R>(
    registrations: ReadonlyArray<Effect.Effect<Registration, E, R>>,
    options?: GovernanceOptions,
  ): Layer.Layer<Service, E, Exclude<R, import("effect/Scope").Scope>>
} = Function.dual(
  (args) => args.length !== 1 || Array.isArray(args[0]),
  <E, R>(registrations: ReadonlyArray<Effect.Effect<Registration, E, R>>, options?: GovernanceOptions) =>
    Layer.unwrap(Effect.all(registrations).pipe(Effect.map((items) => layer(items, options)))),
)

/** @experimental */
export const combine: {
  <E = never, R = never>(
    options?: GovernanceOptions,
  ): (registries: ReadonlyArray<Layer.Layer<Service, E, R>>) => Layer.Layer<Service, E, R>
  <E = never, R = never>(
    registries: ReadonlyArray<Layer.Layer<Service, E, R>>,
    options?: GovernanceOptions,
  ): Layer.Layer<Service, E, R>
} = Function.dual(
  (args) => args.length !== 1 || Array.isArray(args[0]),
  <E = never, R = never>(
    registries: ReadonlyArray<Layer.Layer<Service, E, R>>,
    options?: GovernanceOptions,
  ): Layer.Layer<Service, E, R> =>
    Layer.unwrap(
      Effect.forEach(registries, (registry) =>
        Layer.build(registry).pipe(Effect.flatMap((context) => Context.get(context, Service).registrations)),
      ).pipe(Effect.map((groups) => layer(groups.flat(), options))),
    ),
)

/** @experimental In-memory model registry. */
export const layerMemory: typeof layer = layer

/**
 * @experimental
 * @deprecated Use {@link layerMemory}. This alias will not be removed before 1.0.0 and only in a separately planned major release.
 */
export const memoryLayer: typeof layerMemory = layerMemory

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
export const operate: {
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): (
    selection: ModelSelection,
  ) => Effect.Effect<A, E | LanguageModelNotRegistered, Service | Exclude<R, ModelEnvironment>>
  <A, E, R>(
    selection: ModelSelection,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | LanguageModelNotRegistered, Service | Exclude<R, ModelEnvironment>>
} = Function.dual(2, <A, E, R>(selection: ModelSelection, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const service = yield* Service
    return yield* service.operate(selection, effect)
  }),
)

/** @experimental */
export const stream: {
  <A, E, R>(
    operation: Stream.Stream<A, E, R>,
  ): (
    selection: ModelSelection,
  ) => Stream.Stream<A, E | LanguageModelNotRegistered, Service | Exclude<R, ModelEnvironment>>
  <A, E, R>(
    selection: ModelSelection,
    operation: Stream.Stream<A, E, R>,
  ): Stream.Stream<A, E | LanguageModelNotRegistered, Service | Exclude<R, ModelEnvironment>>
} = Function.dual(2, <A, E, R>(selection: ModelSelection, operation: Stream.Stream<A, E, R>) =>
  Stream.unwrap(Service.pipe(Effect.map((service) => service.stream(selection, operation)))),
)

/**
 * @experimental
 * @deprecated Use {@link operate}. This alias will not be removed before 1.0.0 and only in a separately planned major release.
 */
export const provide: typeof operate = operate
