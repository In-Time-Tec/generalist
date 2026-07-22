import { Context, Effect, Fiber, Function, HashMap, Layer, Option, Ref, Schema, Scope, Semaphore, Stream } from "effect"
import { LanguageModel, Model } from "effect/unstable/ai"
import { classify as classifyContextOverflow } from "./context-overflow.js"
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

/** @experimental Semantic classification of a model failure. */
export type FailureClassification = "context-overflow" | "other"

/** @experimental Provider-owned semantic model-failure classifier. */
export type FailureClassifier = (error: unknown) => FailureClassification

const FailureClassifierTypeId = Symbol.for("@batonfx/core/model-registry/FailureClassifier")

type ClassifiedLanguageModel = LanguageModel.Service & {
  readonly [FailureClassifierTypeId]?: FailureClassifier
}

/** @experimental Classify a failure using semantics attached to the active registered model, falling back to provider-agnostic context-overflow evidence. */
export const classifyFailure: {
  (error: unknown): (model: LanguageModel.Service) => FailureClassification
  (model: LanguageModel.Service, error: unknown): FailureClassification
} = Function.dual(2, (model: LanguageModel.Service, error: unknown): FailureClassification => {
  const classified = (model as ClassifiedLanguageModel)[FailureClassifierTypeId]?.(error)
  return classified !== undefined && classified !== "other" ? classified : classifyContextOverflow(error)
})

const attachFailureClassifier = (registration: Registration, context: Context.Context<ModelEnvironment>) => {
  if (registration.classifyFailure === undefined) return context
  const model = Context.get(context, LanguageModel.LanguageModel)
  const classified: ClassifiedLanguageModel = {
    ...model,
    [FailureClassifierTypeId]: registration.classifyFailure,
  }
  return Context.add(context, LanguageModel.LanguageModel, classified)
}

/** @experimental */
export class LanguageModelNotRegistered extends Schema.TaggedErrorClass<LanguageModelNotRegistered>()(
  "@batonfx/core/LanguageModelNotRegistered",
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
  readonly classifyFailure?: FailureClassifier
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
}

/** @experimental */
export class ModelRegistry extends Context.Service<ModelRegistry, Interface>()("@batonfx/core/ModelRegistry") {}

/** @experimental */
export type ModelEnvironment = LanguageModel.LanguageModel | Model.ProviderName | Model.ModelName
interface RegistryEntry {
  readonly registration: Registration
  readonly context: Effect.Effect<Context.Context<ModelEnvironment>>
}

interface Registry {
  readonly byKey: HashMap.HashMap<string, RegistryEntry>
  readonly keys: ReadonlyArray<string>
}

const selectionKey = (selection: ModelSelection) =>
  JSON.stringify([selection.provider, selection.model, selection.registrationKey ?? null])

const upsertRegistration = (registry: Registry, entry: RegistryEntry): Registry => {
  const key = selectionKey(entry.registration)
  return {
    byKey: HashMap.set(registry.byKey, key, entry),
    keys: HashMap.has(registry.byKey, key) ? registry.keys : [...registry.keys, key],
  }
}

const findRegistration = (registry: Registry, selection: ModelSelection) =>
  HashMap.get(registry.byKey, selectionKey(selection)).pipe(Option.getOrUndefined)

/** @experimental */
export const registration = <R>(input: {
  readonly provider: string
  readonly model: string
  readonly registrationKey?: string
  readonly layer: Layer.Layer<LanguageModel.LanguageModel, never, R>
  readonly metadata?: Metadata
  readonly classifyFailure?: FailureClassifier
}) =>
  Model.make(input.provider, input.model, input.layer).captureRequirements.pipe(
    Effect.map(
      (layer): Registration => ({
        provider: input.provider,
        model: input.model,
        layer,
        ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        ...(input.classifyFailure === undefined ? {} : { classifyFailure: input.classifyFailure }),
      }),
    ),
  )

const makeLayer = (initialRegistrations: ReadonlyArray<Registration>, options?: GovernanceOptions) =>
  Layer.effect(
    ModelRegistry,
    Effect.gen(function* () {
      const memoMap = yield* Layer.makeMemoMap
      const scope = yield* Effect.scope
      const makeEntry = Effect.fnUntraced(function* (candidate: Registration) {
        const fiber = yield* Effect.cached(
          Effect.forkIn(Layer.buildWithMemoMap(candidate.layer, memoMap, scope), scope, {
            startImmediately: true,
          }),
        )
        const context = Effect.uninterruptible(fiber).pipe(Effect.flatMap(Fiber.join))
        return { registration: candidate, context }
      })
      const initialEntries = yield* Effect.forEach(initialRegistrations, makeEntry)
      const registry = yield* Ref.make<Registry>(
        initialEntries.reduce(upsertRegistration, {
          byKey: HashMap.empty<string, RegistryEntry>(),
          keys: [],
        }),
      )

      const semaphore =
        options?.maxConcurrentModelCalls === undefined
          ? undefined
          : yield* Semaphore.make(options.maxConcurrentModelCalls)

      const register = Effect.fn("ModelRegistry.register")(function* (input: RegisterInput) {
        const entry = yield* makeEntry(input.registration)
        yield* Ref.update(registry, (items) => upsertRegistration(items, entry))
      })

      const registrations = Ref.get(registry).pipe(
        Effect.map((items) => items.keys.map((key) => HashMap.getUnsafe(items.byKey, key).registration)),
      )

      const operate = Effect.fn("ModelRegistry.operate")(function* <A, E, R>(
        selection: ModelSelection,
        effect: Effect.Effect<A, E, R>,
      ) {
        const items = yield* Ref.get(registry)
        const entry = findRegistration(items, selection)
        if (entry === undefined) {
          return yield* LanguageModelNotRegistered.make({
            provider: selection.provider,
            model: selection.model,
            ...(selection.registrationKey === undefined ? {} : { registration_key: selection.registrationKey }),
          })
        }
        const provided = entry.context.pipe(
          Effect.flatMap((context) =>
            effect.pipe(Effect.provide(attachFailureClassifier(entry.registration, context))),
          ),
        )
        return yield* semaphore === undefined ? provided : semaphore.withPermits(1)(provided)
      })

      const stream = <A, E, R>(selection: ModelSelection, operation: Stream.Stream<A, E, R>) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const items = yield* Ref.get(registry)
            const entry = findRegistration(items, selection)
            if (entry === undefined) {
              return yield* LanguageModelNotRegistered.make({
                provider: selection.provider,
                model: selection.model,
                ...(selection.registrationKey === undefined ? {} : { registration_key: selection.registrationKey }),
              })
            }
            if (semaphore !== undefined) {
              yield* Effect.acquireRelease(semaphore.take(1), () => semaphore.release(1), { interruptible: true })
            }
            const context = attachFailureClassifier(entry.registration, yield* entry.context)
            return operation.pipe(Stream.provideContext(context))
          }),
        )

      return ModelRegistry.of({
        register,
        registrations,
        operate,
        stream,
      })
    }),
  )

/** @experimental */
export const layer: {
  (): Layer.Layer<ModelRegistry>
  <E = never, R = never>(
    options?: GovernanceOptions,
  ): (
    registrations?: ReadonlyArray<Effect.Effect<Registration, E, R>>,
  ) => Layer.Layer<ModelRegistry, E, Exclude<R, Scope.Scope>>
  <E = never, R = never>(
    registrations?: ReadonlyArray<Effect.Effect<Registration, E, R>>,
    options?: GovernanceOptions,
  ): Layer.Layer<ModelRegistry, E, Exclude<R, Scope.Scope>>
} = Function.dual(
  (args) => args.length === 0 || args.length > 1 || Array.isArray(args[0]),
  <E = never, R = never>(
    registrations: ReadonlyArray<Effect.Effect<Registration, E, R>> = [],
    options?: GovernanceOptions,
  ): Layer.Layer<ModelRegistry, E, Exclude<R, Scope.Scope>> =>
    Layer.unwrap(
      Effect.all(registrations).pipe(Effect.map((initialRegistrations) => makeLayer(initialRegistrations, options))),
    ),
)

/** @experimental */
export const layerCombined: {
  <E = never, R = never>(
    options?: GovernanceOptions,
  ): (registries: ReadonlyArray<Layer.Layer<ModelRegistry, E, R>>) => Layer.Layer<ModelRegistry, E, R>
  <E = never, R = never>(
    registries: ReadonlyArray<Layer.Layer<ModelRegistry, E, R>>,
    options?: GovernanceOptions,
  ): Layer.Layer<ModelRegistry, E, R>
} = Function.dual(
  (args) => args.length !== 1 || Array.isArray(args[0]),
  <E = never, R = never>(
    registries: ReadonlyArray<Layer.Layer<ModelRegistry, E, R>>,
    options?: GovernanceOptions,
  ): Layer.Layer<ModelRegistry, E, R> =>
    Layer.unwrap(
      Effect.forEach(registries, (registry) =>
        Layer.build(registry).pipe(Effect.flatMap((context) => Context.get(context, ModelRegistry).registrations)),
      ).pipe(Effect.map((groups) => makeLayer(groups.flat(), options))),
    ),
)

/** @experimental In-memory model registry. */
export const layerMemory: typeof layer = layer

/** @experimental */
export const layerTest = (implementation: Interface) => Layer.succeed(ModelRegistry, ModelRegistry.of(implementation))

/** @experimental */
export const register = Effect.fn("ModelRegistry.register.call")(function* (input: RegisterInput) {
  const service = yield* ModelRegistry
  return yield* service.register(input)
})

/** @experimental */
export const registrations = Effect.fn("ModelRegistry.registrations.call")(function* () {
  const service = yield* ModelRegistry
  return yield* service.registrations
})

/** @experimental */
export const operate: {
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): (
    selection: ModelSelection,
  ) => Effect.Effect<A, E | LanguageModelNotRegistered, ModelRegistry | Exclude<R, ModelEnvironment>>
  <A, E, R>(
    selection: ModelSelection,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | LanguageModelNotRegistered, ModelRegistry | Exclude<R, ModelEnvironment>>
} = Function.dual(2, <A, E, R>(selection: ModelSelection, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const service = yield* ModelRegistry
    return yield* service.operate(selection, effect)
  }),
)

/** @experimental */
export const stream: {
  <A, E, R>(
    operation: Stream.Stream<A, E, R>,
  ): (
    selection: ModelSelection,
  ) => Stream.Stream<A, E | LanguageModelNotRegistered, ModelRegistry | Exclude<R, ModelEnvironment>>
  <A, E, R>(
    selection: ModelSelection,
    operation: Stream.Stream<A, E, R>,
  ): Stream.Stream<A, E | LanguageModelNotRegistered, ModelRegistry | Exclude<R, ModelEnvironment>>
} = Function.dual(2, <A, E, R>(selection: ModelSelection, operation: Stream.Stream<A, E, R>) =>
  Stream.unwrap(ModelRegistry.pipe(Effect.map((service) => service.stream(selection, operation)))),
)
