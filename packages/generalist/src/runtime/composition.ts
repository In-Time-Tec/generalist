/* oxlint-disable effecttsgo/any-unknown-in-error-context, effecttsgo/unsafe-effect-type-assertion, anti-slop/no-unknown-parameters, typescript/no-unsafe-type-assertion, typescript/no-unsafe-argument, typescript/no-unsafe-return, typescript/no-unsafe-call, typescript/no-unsafe-member-access -- Runtime.layer erases heterogeneous Agent declarations behind AgentRegistry and restores each exact contract through the distributive AgentServices helper. */
import {
  Context,
  type Crypto,
  type Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Schema,
  Scope,
  Types,
} from "effect"
import type { Prompt, Tool } from "effect/unstable/ai"
import type { Agent, Any as AnyAgent, ClosedServices } from "../core/agent/lifecycle/definition.js"
import type { ObjectStore } from "../durability/object-store.js"
import type { ActivationFailure, Options as RuntimeOptions } from "../durability/internal/runtime.js"
import { activate as activateRuntime } from "../durability/activation.js"
import { layer as reconstructedLayer, RuntimeLifecycle, type RuntimeLifecycleService } from "./state/layer.js"
import {
  Runtime,
  type RunHandle,
  type RunSendError,
  type RunSendOptions,
  type SendError,
  type SendFunction,
  type SendInput,
  type Service as RuntimeService,
} from "./service.js"
import type { RunReceipt } from "./run.js"
import type { SteeringReceipt } from "./run/steering.js"
import {
  ExecutableResolver,
  type Input as ResolverInput,
  type Resolution,
  type ResolveError,
  type Service as ResolverService,
} from "./executable/resolver.js"
import {
  AgentBuildRevision,
  AgentProfiles,
  capture,
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
}

interface AnyOptions {
  readonly agents: AgentRegistry
  readonly revision: string
  readonly services: Layer.Layer<never, unknown, unknown>
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

/** Resolution failures that are already RunFailure members and pass through unchanged. */
const RunFailurePassthrough = Schema.Union([
  RevisionUnavailable,
  RevisionMismatch,
  ExecutablePinMissing,
  ExecutableRegistrationInvalid,
  ExecutableRegistrationMissing,
])

const persistedRevision = (input: ResolverInput): string => {
  for (const registration of input.registrations) {
    const decoded = Schema.decodeUnknownOption(RevisionPayload)(registration.payload)
    if (Option.isSome(decoded)) return decoded.value.revision
  }
  return ""
}

const activeAgentName = (input: ResolverInput): string => {
  const active = input.manifest.entries.find((entry) => entry.pin === input.ref.active)
  return active?._tag === "Agent" ? active.manifest.name : ""
}

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
): Effect.Effect<ReadonlyMap<string, string>, RuntimeOptionsInvalid> =>
  Effect.gen(function* () {
    const pinByAgent = new Map<string, string>()
    for (const agent of declared) {
      // SAFETY: every declared member originates from Agent.make; AgentRegistry erases only
      // invariant Agent parameters which capture restores from the supplied service context.
      const captured = yield* (
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
  const load = (input: ResolverInput): Effect.Effect<Resolution, unknown, Scope.Scope> =>
    Effect.gen(function* () {
      const agentName = activeAgentName(input)
      const revision = persistedRevision(input)
      const executablePin: string = input.ref.executable
      const cached = loaded.get(executablePin)
      if (cached !== undefined) {
        return yield* resolveRegisteredAgent(cached.agents, missing, input)
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
        const agents = makeRegisteredAgents()
        const declared = Object.values(definition.agents)
        const pinByAgent = yield* registerClosure(
          declared,
          definition.revision,
          Context.merge(environment, services),
          agents,
        )
        const derivedPin = pinByAgent.get(agentName) ?? ""
        if (definition.revision !== revision || derivedPin !== executablePin) {
          return yield* RevisionMismatch.make({
            expectedRevision: revision,
            loadedRevision: definition.revision,
            expectedExecutablePin: executablePin,
            derivedExecutablePin: derivedPin,
          })
        }
        loaded.set(executablePin, { revision: definition.revision, pinByAgent, agents })
        return yield* resolveRegisteredAgent(agents, missing, input)
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
            : ExecutableRegistrationInvalid.make({ message: `Revision load failed: ${String(error)}` }),
        ),
      )
      // SAFETY: every failure escaping `normalized` is a declared RunFailure member; the erased
      // resolver boundary cannot name the application's loader error types.
      return normalized as Effect.Effect<Resolution, ResolveError, Scope.Scope>
    },
  }
  return service
}

const guardRunHandle = <Output>(lifecycle: RuntimeLifecycleService, handle: RunHandle<Output>): RunHandle<Output> => ({
  ...handle,
  send: (message, options) => lifecycle.run(handle.send(message, options)),
})

const guardSend = (runtime: RuntimeService, lifecycle: RuntimeLifecycleService): SendFunction => {
  function send(
    runId: string,
    prompt: Prompt.Prompt | string,
    options?: RunSendOptions,
  ): Effect.Effect<SteeringReceipt, RunSendError>
  function send(input: SendInput): Effect.Effect<RunReceipt, SendError>
  function send(
    input: SendInput | string,
    prompt?: Prompt.Prompt | string,
    options?: RunSendOptions,
  ): Effect.Effect<RunReceipt | SteeringReceipt, SendError | RunSendError> {
    return Predicate.isString(input)
      ? lifecycle.run(runtime.send(input, prompt ?? "", options))
      : lifecycle.run(runtime.send(input))
  }
  return send
}

const guardOperator = (
  operator: RuntimeService["operator"],
  lifecycle: RuntimeLifecycleService,
): RuntimeService["operator"] => ({
  ...operator,
  retry: (runId, identity, commandId) => lifecycle.run(operator.retry(runId, identity, commandId)),
  wake: (runId, identity, commandId) => lifecycle.run(operator.wake(runId, identity, commandId)),
  resolveUnknown: (runId, operationId, resolution, identity, commandId) =>
    lifecycle.run(operator.resolveUnknown(runId, operationId, resolution, identity, commandId)),
  resolveApproval: (token, decision, identity, commandId) =>
    lifecycle.run(operator.resolveApproval(token, decision, identity, commandId)),
  extendBudget: (runId, delta, identity, commandId) =>
    lifecycle.run(operator.extendBudget(runId, delta, identity, commandId)),
})

const guardRuntime = (runtime: RuntimeService, lifecycle: RuntimeLifecycleService): RuntimeService => {
  const guarded: RuntimeService = {
    ...runtime,
    operator: guardOperator(runtime.operator, lifecycle),
    activate: (input) => lifecycle.run(runtime.activate(input)),
    admit: (input) => lifecycle.run(runtime.admit(input)),
    fanOut: (input) => lifecycle.run(runtime.fanOut(input)),
    fork: (runId, options) =>
      lifecycle.run(runtime.fork(runId, options)).pipe(Effect.map((handle) => guardRunHandle(lifecycle, handle))),
    getRun: (runId) => runtime.getRun(runId).pipe(Effect.map((handle) => guardRunHandle(lifecycle, handle))),
    controlSession: (input) => lifecycle.run(runtime.controlSession(input)),
    messageSessionInput: (input) => lifecycle.run(runtime.messageSessionInput(input)),
    respond: (input) => lifecycle.run(runtime.respond(input)),
    respondApproval: (input) => lifecycle.run(runtime.respondApproval(input)),
    rewind: (runId, options) => lifecycle.run(runtime.rewind(runId, options)),
    resolveOperation: (input) => lifecycle.run(runtime.resolveOperation(input)),
    schedule: (agent, input, options) => lifecycle.run(runtime.schedule(agent, input, options)),
    send: guardSend(runtime, lifecycle),
    sendMessage: (input) => lifecycle.run(runtime.sendMessage(input)),
    signal: (input) => lifecycle.run(runtime.signal(input)),
    spawn: (input) => lifecycle.run(runtime.spawn(input)),
    start: (agent, input, options) =>
      lifecycle
        .run(runtime.start(agent, input, options))
        .pipe(Effect.map((handle) => guardRunHandle(lifecycle, handle))),
    startExecution: (input) => lifecycle.run(runtime.startExecution(input)),
    startTool: (tool, input, options) => lifecycle.run(runtime.startTool(tool, input, options)),
    startToolEncoded: (tool, input, options) => lifecycle.run(runtime.startToolEncoded(tool, input, options)),
    submitSessionInput: (input) => lifecycle.run(runtime.submitSessionInput(input)),
    extendBudget: (input) => lifecycle.run(runtime.extendBudget(input)),
    wake: (input) => lifecycle.run(runtime.wake(input)),
  }
  return guarded
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
      const built = yield* Layer.build(inner).pipe(
        Effect.provide(Context.merge(storage, Context.make(ExecutableResolver, resolver))),
      )
      const runtime = Context.get(built, Runtime)
      const lifecycle = Context.get(built, RuntimeLifecycle)
      const declared = Object.values(options.agents)
      const registrationContext = Context.merge(environment, services)
      for (const agent of declared) {
        // SAFETY: every declared member originates from Agent.make; AgentRegistry erases only
        // invariant Agent parameters which register restores from the supplied service context.
        yield* (
          runtime.register(agent as ErasedAgent) as Effect.Effect<
            void,
            DuplicateAgent | ExecutableRegistrationInvalid,
            unknown
          >
        ).pipe(
          Effect.provideContext(registrationContext),
          Effect.provideService(AgentProfiles, declared),
          Effect.provideService(AgentBuildRevision, options.revision),
          Effect.mapError(invalidRegistration),
        )
      }
      yield* activateRuntime.pipe(Effect.provide(built))
      return Layer.succeed(Runtime, guardRuntime(runtime, lifecycle))
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
