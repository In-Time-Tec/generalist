/* oxlint-disable effecttsgo/any-unknown-in-error-context, effecttsgo/unsafe-effect-type-assertion, anti-slop/no-unknown-parameters, typescript/no-unsafe-type-assertion, typescript/no-unsafe-argument, typescript/no-unsafe-return, typescript/no-unsafe-call, typescript/no-unsafe-member-access -- Runtime.layer erases heterogeneous Agent declarations behind AgentRegistry and restores each exact contract through the distributive AgentServices helper. */
import { Context, type Crypto, type Duration, Effect, Exit, Layer, Option, Schema, Scope, Types } from "effect"
import type { Tool } from "effect/unstable/ai"
import type { Agent, Any as AnyAgent, ClosedServices } from "../core/agent/lifecycle/definition.js"
import type { ObjectStore } from "../durability/object-store.js"
import type { ActivationFailure, Options as RuntimeOptions } from "../durability/internal/runtime.js"
import { activate as activateRuntime } from "../durability/activation.js"
import { layer as reconstructedLayer } from "./state/layer.js"
import { Runtime as EngineRuntime } from "./engine.js"
import { Runtime } from "./service.js"
import {
  ExecutableResolver,
  type Input as ResolverInput,
  type Resolution,
  type ResolveError,
  type Service as ResolverService,
} from "./executable/resolver.js"
import {
  AgentBuildRevision,
  AgentExecutionServices,
  AgentRuntimePartition,
  AgentProfiles,
  capture,
  captureWithExecutionServices,
  make as makeRegisteredAgents,
  resolve as resolveRegisteredAgent,
  validateProfiles,
  type RegisteredAgent,
  type RegisteredAgents,
} from "./executable/registered-agent.js"
import {
  DuplicateAgent,
  ExecutablePinMissing,
  ExecutableRegistrationInvalid,
  ExecutableRegistrationMissing,
  RevisionMismatch,
  RevisionUnavailable,
  RuntimeOptionsInvalid,
} from "./errors.js"
import type { ErasedExecutionServicesFactory, ExecutionServicesFactory } from "./execution/scope.js"
import { ExternalChildPeerRoutes } from "./child/external/reconciliation.js"

const MAX_REVISION_LENGTH = 255
const MAX_NAME_LENGTH = 128

/** Explicit environment, tenant, and partition identity for one Runtime partition. */
export interface Namespace {
  readonly environment: string
  readonly tenant: string
  readonly partition: string
}

/** Named Agent declarations; each key must equal its Agent name. */
export type AgentRegistry = Readonly<Record<string, AnyAgent>>

/** Services one declared Agent requires its closing Layer to provide. */
export type AgentServices<A> =
  A extends Agent<
    infer Tools,
    infer AgentRequirements,
    infer _PolicyServices,
    infer _AuthorizationServices,
    infer InputSchema,
    infer OutputSchema
  >
    ? ClosedServices<Tools, AgentRequirements, InputSchema, OutputSchema>
    : never

/** Codec services needed before an execution scope exists or after it has retired. */
export type AgentBoundaryServices<A> =
  A extends Agent<
    infer _Tools,
    infer _AgentRequirements,
    infer _PolicyServices,
    infer _AuthorizationServices,
    infer InputSchema,
    infer OutputSchema
  >
    ? InputSchema["EncodingServices"] | OutputSchema["DecodingServices"]
    : never

/** Exact retained identity supplied to a RevisionLoader. */
export interface RevisionRequest {
  readonly revision: string
  readonly agentName: string
  readonly executablePin: string
}

/** One exact historical Agent/service declaration loadable by revision. */
export interface RevisionDefinition<Agents extends AgentRegistry, ServiceError = never, ServiceRequirements = never> {
  readonly agents: Agents
  readonly revision: string
  readonly services: Layer.Layer<AgentServices<Agents[keyof Agents]>, ServiceError, ServiceRequirements>
}

/** Result of one exact-revision lookup. */
export type RevisionLoadResult<Agents extends AgentRegistry, ServiceError, ServiceRequirements> =
  | {
      readonly _tag: "Found"
      readonly definition: RevisionDefinition<Agents, ServiceError, ServiceRequirements>
    }
  | {
      readonly _tag: "NotFound"
      readonly revision: string
      readonly agentName: string
    }

/** Application-owned lookup of one exact retained Agent/service declaration. */
export type RevisionLoader<
  Agents extends AgentRegistry,
  LoadError,
  LoadRequirements,
  ServiceError,
  ServiceRequirements,
> = (
  request: RevisionRequest,
) => Effect.Effect<
  RevisionLoadResult<Agents, ServiceError, ServiceRequirements>,
  LoadError,
  LoadRequirements | Scope.Scope
>

/** Ordinary Runtime.layer declaration without a retained-revision loader. */
export interface Options<
  Agents extends AgentRegistry,
  ServiceError = never,
  ServiceRequirements = never,
  StorageError = never,
  StorageRequirements = never,
> {
  readonly agents: Agents
  readonly revision: string
  readonly services: Layer.Layer<AgentServices<Agents[keyof Agents]>, ServiceError, ServiceRequirements>
  readonly storage: Layer.Layer<ObjectStore | Crypto.Crypto, StorageError, StorageRequirements>
  readonly namespace: Namespace
  readonly scheduler?: {
    readonly concurrency?: number
    readonly pollInterval?: Duration.Input
  }
  readonly loadRevision?: never
}

/** Runtime.layer declaration with an exact retained-revision loader. */
export interface VersionedOptions<
  Agents extends AgentRegistry,
  ServiceError,
  ServiceRequirements,
  StorageError,
  StorageRequirements,
  LoadedAgents extends AgentRegistry,
  LoadError,
  LoadRequirements,
  LoadedServiceError,
  LoadedServiceRequirements,
> extends Omit<Options<Agents, ServiceError, ServiceRequirements, StorageError, StorageRequirements>, "loadRevision"> {
  readonly loadRevision: RevisionLoader<
    LoadedAgents,
    LoadError,
    LoadRequirements,
    LoadedServiceError,
    LoadedServiceRequirements
  >
}

type Covers<Needed, Provided> = [Exclude<Needed, Provided>] extends [never] ? object : never

/** Runtime.layer declaration whose Agent environment is completed for each live execution. */
export type ExecutionServicesOptions<
  Agents extends AgentRegistry,
  BaseServices,
  ServiceError,
  ServiceRequirements,
  StorageError,
  StorageRequirements,
  ExecutionServices,
  ExecutionRequirements,
> = Omit<
  Options<Agents, ServiceError, ServiceRequirements, StorageError, StorageRequirements>,
  "services" | "loadRevision"
> & {
  readonly services: Layer.Layer<BaseServices, ServiceError, ServiceRequirements>
  readonly executionServices: ExecutionServicesFactory<Agents, ExecutionServices, ExecutionRequirements>
} & Covers<AgentServices<Agents[keyof Agents]>, BaseServices | ExecutionServices> &
  Covers<AgentBoundaryServices<Agents[keyof Agents]>, BaseServices> &
  Covers<ExecutionRequirements, BaseServices | Runtime>

/** One exact historical Agent/base/factory declaration. */
export type ExecutionRevisionDefinition<
  Agents extends AgentRegistry,
  BaseServices,
  ServiceError,
  ServiceRequirements,
  ExecutionServices,
  ExecutionRequirements,
> = {
  readonly agents: Agents
  readonly revision: string
  readonly services: Layer.Layer<BaseServices, ServiceError, ServiceRequirements>
  readonly executionServices: ExecutionServicesFactory<Agents, ExecutionServices, ExecutionRequirements>
} & Covers<AgentServices<Agents[keyof Agents]>, BaseServices | ExecutionServices> &
  Covers<AgentBoundaryServices<Agents[keyof Agents]>, BaseServices> &
  Covers<ExecutionRequirements, BaseServices | Runtime>

/** Result of one exact historical execution-service revision lookup. */
export type ExecutionRevisionLoadResult<
  Agents extends AgentRegistry,
  BaseServices,
  ServiceError,
  ServiceRequirements,
  ExecutionServices,
  ExecutionRequirements,
> =
  | {
      readonly _tag: "Found"
      readonly definition: ExecutionRevisionDefinition<
        Agents,
        BaseServices,
        ServiceError,
        ServiceRequirements,
        ExecutionServices,
        ExecutionRequirements
      >
    }
  | { readonly _tag: "NotFound"; readonly revision: string; readonly agentName: string }

/** Application-owned lookup of one exact retained Agent/base/factory declaration. */
export type ExecutionRevisionLoader<
  Agents extends AgentRegistry,
  BaseServices,
  ServiceError,
  ServiceRequirements,
  ExecutionServices,
  ExecutionRequirements,
  LoadError,
  LoadRequirements,
> = (
  request: RevisionRequest,
) => Effect.Effect<
  ExecutionRevisionLoadResult<
    Agents,
    BaseServices,
    ServiceError,
    ServiceRequirements,
    ExecutionServices,
    ExecutionRequirements
  >,
  LoadError,
  LoadRequirements | Scope.Scope
>

/** Execution-service composition with an independent exact-revision loader. */
export type VersionedExecutionServicesOptions<
  Agents extends AgentRegistry,
  BaseServices,
  ServiceError,
  ServiceRequirements,
  StorageError,
  StorageRequirements,
  ExecutionServices,
  ExecutionRequirements,
  LoadedAgents extends AgentRegistry,
  LoadedBaseServices,
  LoadError,
  LoadRequirements,
  LoadedServiceError,
  LoadedServiceRequirements,
  LoadedExecutionServices,
  LoadedExecutionRequirements,
> = Omit<
  ExecutionServicesOptions<
    Agents,
    BaseServices,
    ServiceError,
    ServiceRequirements,
    StorageError,
    StorageRequirements,
    ExecutionServices,
    ExecutionRequirements
  >,
  "loadRevision"
> & {
  readonly loadRevision: ExecutionRevisionLoader<
    LoadedAgents,
    LoadedBaseServices,
    LoadedServiceError,
    LoadedServiceRequirements,
    LoadedExecutionServices,
    LoadedExecutionRequirements,
    LoadError,
    LoadRequirements
  >
}

/** Every typed failure Runtime.layer acquisition can raise. */
export type AcquisitionError<ServiceError, StorageError, LoadError = never, LoadedServiceError = never> =
  | ServiceError
  | StorageError
  | LoadError
  | LoadedServiceError
  | RuntimeOptionsInvalid
  | RevisionUnavailable
  | RevisionMismatch
  | ActivationFailure

/** Every service Runtime.layer acquisition requires beyond its own Layers. */
export type Requirements<
  ServiceRequirements,
  StorageRequirements,
  LoadRequirements = never,
  LoadedServiceRequirements = never,
> = ServiceRequirements | StorageRequirements | LoadRequirements | LoadedServiceRequirements

/** Runtime.layer overloaded composition contract. */
export interface LayerFactory {
  <
    const Agents extends AgentRegistry,
    BaseServices,
    ServiceError,
    ServiceRequirements,
    StorageError,
    StorageRequirements,
    ExecutionServices,
    ExecutionRequirements,
  >(
    options: ExecutionServicesOptions<
      Agents,
      BaseServices,
      ServiceError,
      ServiceRequirements,
      StorageError,
      StorageRequirements,
      ExecutionServices,
      ExecutionRequirements
    >,
  ): Layer.Layer<
    Runtime,
    AcquisitionError<ServiceError, StorageError>,
    Requirements<ServiceRequirements, StorageRequirements>
  >

  <
    const Agents extends AgentRegistry,
    BaseServices,
    ServiceError,
    ServiceRequirements,
    StorageError,
    StorageRequirements,
    ExecutionServices,
    ExecutionRequirements,
    const LoadedAgents extends AgentRegistry,
    LoadedBaseServices,
    LoadError,
    LoadRequirements,
    LoadedServiceError,
    LoadedServiceRequirements,
    LoadedExecutionServices,
    LoadedExecutionRequirements,
  >(
    options: VersionedExecutionServicesOptions<
      Agents,
      BaseServices,
      ServiceError,
      ServiceRequirements,
      StorageError,
      StorageRequirements,
      ExecutionServices,
      ExecutionRequirements,
      LoadedAgents,
      LoadedBaseServices,
      LoadError,
      LoadRequirements,
      LoadedServiceError,
      LoadedServiceRequirements,
      LoadedExecutionServices,
      LoadedExecutionRequirements
    >,
  ): Layer.Layer<
    Runtime,
    AcquisitionError<ServiceError, StorageError, LoadError, LoadedServiceError>,
    Requirements<ServiceRequirements, StorageRequirements, LoadRequirements, LoadedServiceRequirements>
  >

  <const Agents extends AgentRegistry, ServiceError, ServiceRequirements, StorageError, StorageRequirements>(
    options: Options<Agents, ServiceError, ServiceRequirements, StorageError, StorageRequirements>,
  ): Layer.Layer<
    Runtime,
    AcquisitionError<ServiceError, StorageError>,
    Requirements<ServiceRequirements, StorageRequirements>
  >

  <
    const Agents extends AgentRegistry,
    ServiceError,
    ServiceRequirements,
    StorageError,
    StorageRequirements,
    const LoadedAgents extends AgentRegistry,
    LoadError,
    LoadRequirements,
    LoadedServiceError,
    LoadedServiceRequirements,
  >(
    options: VersionedOptions<
      Agents,
      ServiceError,
      ServiceRequirements,
      StorageError,
      StorageRequirements,
      LoadedAgents,
      LoadError,
      LoadRequirements,
      LoadedServiceError,
      LoadedServiceRequirements
    >,
  ): Layer.Layer<
    Runtime,
    AcquisitionError<ServiceError, StorageError, LoadError, LoadedServiceError>,
    Requirements<ServiceRequirements, StorageRequirements, LoadRequirements, LoadedServiceRequirements>
  >
}

type ErasedAgent = Agent<Record<string, Tool.Any>, unknown, unknown, unknown, Schema.Top, Schema.Top>

interface AnyRevisionDefinition {
  readonly agents: AgentRegistry
  readonly revision: string
  readonly services: Layer.Layer<never, unknown, unknown>
  readonly executionServices?: ErasedExecutionServicesFactory
}

interface AnyOptions {
  readonly agents: AgentRegistry
  readonly revision: string
  readonly services: Layer.Layer<never, unknown, unknown>
  readonly executionServices?: ErasedExecutionServicesFactory
  readonly storage: Layer.Layer<ObjectStore | Crypto.Crypto, unknown, unknown>
  readonly namespace: Namespace
  readonly scheduler?: Options<AgentRegistry>["scheduler"]
  readonly loadRevision?: (
    request: RevisionRequest,
  ) => Effect.Effect<
    | { readonly _tag: "Found"; readonly definition: AnyRevisionDefinition }
    | { readonly _tag: "NotFound"; readonly revision: string; readonly agentName: string },
    unknown,
    unknown
  >
}

const validate = (options: AnyOptions): Effect.Effect<void, RuntimeOptionsInvalid> =>
  Effect.gen(function* () {
    if (options.revision.length === 0 || options.revision.length > MAX_REVISION_LENGTH) {
      return yield* RuntimeOptionsInvalid.make({
        field: "revision",
        message: `revision must be non-empty and at most ${MAX_REVISION_LENGTH} UTF-16 code units`,
      })
    }
    for (const [segment, value] of Object.entries(options.namespace)) {
      if (value.length === 0) {
        return yield* RuntimeOptionsInvalid.make({
          field: "namespace",
          message: `namespace ${segment} must be non-empty`,
        })
      }
    }
    const entries = Object.entries(options.agents)
    if (entries.length === 0) {
      return yield* RuntimeOptionsInvalid.make({
        field: "agents",
        message: "Agent registry must declare at least one Agent",
      })
    }
    const names = new Set<string>()
    for (const [key, agent] of entries) {
      if (key.length === 0 || key.length > MAX_NAME_LENGTH) {
        return yield* RuntimeOptionsInvalid.make({
          field: "agents",
          message: `Agent registry key must be non-empty and at most ${MAX_NAME_LENGTH} UTF-16 code units`,
        })
      }
      if (agent.name.length === 0 || agent.name.length > MAX_NAME_LENGTH) {
        return yield* RuntimeOptionsInvalid.make({
          field: "agents",
          message: `Agent name must be non-empty and at most ${MAX_NAME_LENGTH} UTF-16 code units`,
        })
      }
      if (key !== agent.name) {
        return yield* RuntimeOptionsInvalid.make({
          field: "agents",
          message: `Agent registry key "${key}" does not equal its Agent name "${agent.name}"`,
        })
      }
      if (names.has(agent.name)) {
        return yield* RuntimeOptionsInvalid.make({
          field: "agents",
          message: `Duplicate Agent name: ${agent.name}`,
        })
      }
      names.add(agent.name)
    }
    yield* validateProfiles(entries.map(([, agent]) => agent)).pipe(
      Effect.mapError((error) => RuntimeOptionsInvalid.make({ field: "agents", message: error.message })),
    )
  })

const registeredAgentCodec = "generalist/runtime/registered-agent"

const RevisionPayload = Schema.Struct({ revision: Schema.String })
const CodeModeRevisionPayload = Schema.Struct({
  pin: Schema.String,
  revision: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_REVISION_LENGTH)),
  ownerAgentName: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_NAME_LENGTH)),
})

/** Resolution failures that are already RunFailure members and pass through unchanged. */
const RunFailurePassthrough = Schema.Union([
  RevisionUnavailable,
  RevisionMismatch,
  ExecutablePinMissing,
  ExecutableRegistrationInvalid,
  ExecutableRegistrationMissing,
])

interface RequestedClosure extends RevisionRequest {
  readonly sandbox?: string
}

const requestedClosure = (input: ResolverInput): Effect.Effect<RequestedClosure, ExecutableRegistrationInvalid> =>
  Effect.gen(function* () {
    const active = input.manifest.entries.find((entry) => entry.pin === input.ref.active)
    if (active?._tag === "Program") {
      const registration = input.registrations.find((entry) => entry.pin === active.manifest.sandbox)
      if (registration === undefined || registration.codec !== registeredAgentCodec || registration.version !== "1") {
        return yield* ExecutableRegistrationInvalid.make({
          message: "CodeMode Program has no exact owner registration",
        })
      }
      const metadata = Schema.decodeUnknownOption(CodeModeRevisionPayload)(registration.payload)
      if (Option.isNone(metadata) || metadata.value.pin !== registration.pin) {
        return yield* ExecutableRegistrationInvalid.make({
          message: "CodeMode Program has no valid persisted owner revision",
        })
      }
      return {
        revision: metadata.value.revision,
        agentName: metadata.value.ownerAgentName,
        executablePin: input.ref.executable,
        sandbox: active.manifest.sandbox,
      }
    }
    let revision = ""
    for (const registration of input.registrations) {
      const decoded = Schema.decodeUnknownOption(RevisionPayload)(registration.payload)
      if (Option.isSome(decoded)) {
        revision = decoded.value.revision
        break
      }
    }
    return {
      revision,
      agentName: active?._tag === "Agent" ? active.manifest.name : "",
      executablePin: input.ref.executable,
    }
  })

interface LoadedClosure {
  readonly revision: string
  readonly pinByAgent: ReadonlyMap<string, string>
  readonly agents: RegisteredAgents
}

const invalidRegistration = (error: DuplicateAgent | ExecutableRegistrationInvalid) =>
  RuntimeOptionsInvalid.make({
    field: "agents",
    message:
      error._tag === "generalist/runtime/DuplicateAgent" ? `Duplicate Agent name: ${error.agentName}` : error.message,
  })

/** Register every declared Agent into one fresh registry over the supplied service context. */
const registerClosure = (
  declared: ReadonlyArray<AnyAgent>,
  revision: string,
  context: Context.Context<unknown>,
  agents: RegisteredAgents,
  executionServices?: {
    readonly factory: ErasedExecutionServicesFactory
    readonly partition: string
  },
): Effect.Effect<ReadonlyMap<string, string>, RuntimeOptionsInvalid> =>
  Effect.gen(function* () {
    const pinByAgent = new Map<string, string>()
    for (const agent of declared) {
      // SAFETY: every declared member originates from Agent.make; AgentRegistry erases only
      // invariant Agent parameters which capture restores from the supplied service context.
      const captured =
        executionServices === undefined
          ? yield* (
              capture(agent as ErasedAgent) as Effect.Effect<
                ReadonlyArray<RegisteredAgent>,
                ExecutableRegistrationInvalid,
                unknown
              >
            ).pipe(
              Effect.provideContext(context),
              Effect.provideService(AgentProfiles, declared),
              Effect.provideService(AgentBuildRevision, revision),
            )
          : yield* captureWithExecutionServices({
              agent,
              context,
              profiles: declared,
              revision,
              factory: executionServices.factory,
              partition: executionServices.partition,
            })
      for (const registration of captured) pinByAgent.set(registration.name, registration.executable.ref.executable)
      yield* agents.registerAll(captured)
    }
    return pinByAgent
  }).pipe(Effect.mapError(invalidRegistration))

/** Exact-revision resolver: retained closures load through the declared RevisionLoader. */
const makeResolver = (
  options: AnyOptions,
  environment: Context.Context<unknown>,
  layerScope: Scope.Scope,
): ResolverService => {
  const loaded = new Map<string, LoadedClosure>()
  const missing: ResolverService = {
    resolve: (input) => ExecutablePinMissing.make({ runId: input.runId, ref: input.ref }),
  }
  const resolveLoaded = (closure: LoadedClosure, request: RequestedClosure, input: ResolverInput) =>
    Effect.gen(function* () {
      const derivedPin = request.sandbox === undefined ? (closure.pinByAgent.get(request.agentName) ?? "") : ""
      if (
        closure.revision !== request.revision ||
        (request.sandbox === undefined && derivedPin !== request.executablePin)
      ) {
        return yield* RevisionMismatch.make({
          expectedRevision: request.revision,
          loadedRevision: closure.revision,
          expectedExecutablePin: request.executablePin,
          derivedExecutablePin: derivedPin,
        })
      }
      if (request.sandbox !== undefined) {
        const owner = yield* closure.agents.resolveCodeMode(request.sandbox)
        if (Option.isNone(owner) || owner.value.name !== request.agentName) return yield* missing.resolve(input)
      }
      return yield* resolveRegisteredAgent(closure.agents, missing, input)
    })
  const load = (input: ResolverInput): Effect.Effect<Resolution, unknown, Scope.Scope> =>
    Effect.gen(function* () {
      const request = yield* requestedClosure(input)
      const { agentName, revision, executablePin } = request
      const cached = loaded.get(executablePin)
      if (cached !== undefined) {
        return yield* resolveLoaded(cached, request, input)
      }
      if (options.loadRevision === undefined) {
        return yield* RevisionUnavailable.make({ revision, agentName, executablePin })
      }
      const loadRevision = options.loadRevision
      const scope = Scope.forkUnsafe(layerScope)
      const loadAndRegister = Effect.gen(function* () {
        const result = yield* loadRevision({ revision, agentName, executablePin }).pipe(
          Effect.provideContext(Context.add(environment, Scope.Scope, scope)),
        )
        if (result._tag === "NotFound") {
          return yield* RevisionUnavailable.make({ revision, agentName, executablePin })
        }
        const definition = result.definition
        const services = yield* Layer.build(definition.services).pipe(
          Effect.provideContext(Context.add(environment, Scope.Scope, scope)),
        )
        const loadedContext = Context.merge(environment, services).pipe(
          Context.add(AgentRuntimePartition, options.namespace.partition),
        )
        const loadedBase =
          definition.executionServices === undefined ? loadedContext : Context.omit(Scope.Scope)(loadedContext)
        const agents = makeRegisteredAgents()
        const declared = Object.values(definition.agents)
        const pinByAgent = yield* registerClosure(
          declared,
          definition.revision,
          loadedBase,
          agents,
          definition.executionServices === undefined
            ? undefined
            : { factory: definition.executionServices, partition: options.namespace.partition },
        )
        const closure = { revision: definition.revision, pinByAgent, agents }
        const resolution = yield* resolveLoaded(closure, request, input)
        loaded.set(executablePin, closure)
        return resolution
      })
      // A rejected or mismatched load retires its forked scope so already-built
      // service resources do not accumulate across attempts.
      return yield* loadAndRegister.pipe(Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause))))
    })
  const service: ResolverService = {
    resolve: (input) => {
      if (!input.registrations.some((registration) => registration.codec === registeredAgentCodec)) {
        return missing.resolve(input)
      }
      // Loader and loaded-definition failures are not RunFailure members; collapse them into
      // ExecutableRegistrationInvalid so a rejected retained Run persists a typed failure.
      const normalized = load(input).pipe(
        Effect.catch((error) =>
          Schema.is(RunFailurePassthrough)(error)
            ? Effect.fail(error)
            : ExecutableRegistrationInvalid.make({
                message: `Revision load failed: ${String(error)}`,
              }),
        ),
      )
      // SAFETY: every failure escaping `normalized` is a declared RunFailure member; the erased
      // resolver boundary cannot name the application's loader error types.
      return normalized as Effect.Effect<Resolution, ResolveError, Scope.Scope>
    },
  }
  return service
}

const make = (options: AnyOptions) =>
  Layer.unwrap(
    Effect.gen(function* () {
      yield* validate(options)
      // SAFETY: the ambient context carries every service the declared Layers require; the
      // erased AgentRegistry boundary cannot name them, so the full context is captured here.
      const environment = (yield* Effect.context<never>()) as Context.Context<unknown>
      const layerScope = yield* Effect.scope
      const storage = yield* Layer.build(options.storage).pipe(Effect.provide(environment))
      const services = yield* Layer.build(options.services).pipe(Effect.provide(environment))
      const resolver = makeResolver(options, environment, layerScope)
      const innerOptions: Types.Mutable<
        Pick<RuntimeOptions, "environment" | "tenant" | "partition" | "addresses"> & Pick<RuntimeOptions, "scheduler">
      > = {
        environment: options.namespace.environment,
        tenant: options.namespace.tenant,
        partition: options.namespace.partition,
        addresses: [],
      }
      if (options.scheduler !== undefined) innerOptions.scheduler = options.scheduler
      const inner = reconstructedLayer(innerOptions)
      const peerRoutes = Context.getOption(services, ExternalChildPeerRoutes)
      const kernelServices = Option.isNone(peerRoutes)
        ? Context.merge(storage, Context.make(ExecutableResolver, resolver))
        : Context.merge(storage, Context.make(ExecutableResolver, resolver)).pipe(
            Context.add(ExternalChildPeerRoutes, peerRoutes.value),
          )
      const built = yield* Layer.build(inner).pipe(
        Effect.provide(kernelServices),
      )
      const runtime = Context.get(built, EngineRuntime)
      const declared = Object.values(options.agents)
      const mergedServices = Context.merge(environment, services)
      const registrationContext =
        options.executionServices === undefined ? mergedServices : Context.omit(Scope.Scope)(mergedServices)
      for (const agent of declared) {
        let agentContext: Context.Context<unknown> = registrationContext.pipe(
          Context.add(AgentProfiles, declared),
          Context.add(AgentBuildRevision, options.revision),
          Context.add(AgentRuntimePartition, options.namespace.partition),
        )
        if (options.executionServices !== undefined) {
          agentContext = Context.add(agentContext, AgentExecutionServices, {
            factory: options.executionServices,
            partition: options.namespace.partition,
          })
        }
        // SAFETY: every declared member originates from Agent.make; AgentRegistry erases only
        // invariant Agent parameters which register restores from the supplied service context.
        yield* (
          runtime.register(agent as ErasedAgent) as Effect.Effect<
            void,
            DuplicateAgent | ExecutableRegistrationInvalid,
            unknown
          >
        ).pipe(Effect.provideContext(agentContext), Effect.mapError(invalidRegistration))
      }
      yield* activateRuntime.pipe(Effect.provide(built))
      return Layer.succeed(Runtime, Context.get(built, Runtime))
    }),
  )

/**
 * Compose declared Agents, their service Layer, storage, and namespace into one Runtime Layer.
 * Declaration performs no I/O. Scoped acquisition validates the declaration, builds storage and
 * Agent services, registers every declared Agent, acquires the fenced execution lease, installs the
 * scheduler and ownership monitor, and only then publishes `Runtime.Runtime`: the acquired Runtime
 * is ready without `Durability.activate`. A failed acquisition closes every acquired resource in
 * reverse order. Ownership loss retires the incarnation (owned requests interrupted and awaited,
 * scheduler calls fail `RuntimeOwnershipLost`); scope close retires it (`RuntimeRetired`).
 */
export const layer: LayerFactory = make
