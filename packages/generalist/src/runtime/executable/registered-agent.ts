import { Context, Effect, Function, Layer, Option, Schema, type Scope } from "effect"
import type { Tool } from "effect/unstable/ai"
import { fromLiveAgent } from "../../core/durable/manifest/agent-manifest.js"
import { digest as pinDigest, makeCapability, makeModel, type CapabilityPin } from "../../core/durable/pin.js"
import {
  close,
  type Agent,
  type Any as AnyAgent,
  type Closed,
  type ClosedServices,
  withTools,
} from "../../core/agent/lifecycle/definition.js"
import {
  DuplicateAgent,
  ExecutablePinMissing,
  ExecutableRegistrationInvalid,
  type ExecutableRegistrationMissing,
  UnknownAgent,
} from "../errors.js"
import { make as makeExecutable } from "./manifest.js"
import type { Input as ResolverInput, ProgramResolution, Resolution, Service as ResolverService } from "./resolver.js"
import { requiredPins, type ExecutableRegistration } from "./registration.js"
import { definition as fanOutDefinition } from "../../core/agent/tool/fan-out.js"
import { Configuration as Tasks } from "../../tasks/internal.js"
import { CommandTool } from "../../core/durable/component.js"
import { namespace } from "../../core/durable/component/definition.js"
import { Hooks } from "../../hooks/index.js"
import { codec as toolCodec, type RegisteredTool } from "./registered-tool.js"
import { AgentBuildRevision } from "./build-revision.js"
import type { ErasedExecutionServicesFactory, RegisteredExecutionBinding } from "../execution/scope.js"
import { bind as bindCodeMode, deriveIdentity, type RegisteredCodeMode } from "../code-mode/registration.js"
import { validate as validateCodeMode } from "../code-mode/declaration.js"
import type { Program } from "../../core/program/agent-program.js"
import { make as makeProgramManifest } from "../../core/durable/manifest/program-manifest.js"
import { make as makeProgramHandlers } from "../../core/program/handlers.js"
import { validateHandlers as validateProgramHandlers } from "../../core/program/runner.js"

const codec = "generalist/runtime/registered-agent"
const version = "1"

/** @internal One process-local Agent registration paired with its durable admission identity. */
export interface RegisteredAgent {
  readonly name: string
  readonly registeredFrom: AnyAgent
  readonly source: AnyAgent
  readonly agent: Closed
  readonly context: Context.Context<unknown>
  readonly executionServices?: {
    readonly factory: ErasedExecutionServicesFactory
    readonly partition: string
  }
  readonly partition?: string
  readonly codeMode?: RegisteredCodeMode
  readonly executable: import("./manifest.js").PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

/** @internal Process-local authority shared by one Runtime service and its executor. */
export interface RegisteredAgents {
  readonly registerTool: (registration: RegisteredTool) => Effect.Effect<void, ExecutableRegistrationInvalid>
  readonly getTool: (tool: Tool.Any) => Effect.Effect<Option.Option<RegisteredTool>>
  readonly resolveTool: (pin: string) => Effect.Effect<Option.Option<RegisteredTool>>
  readonly register: (registration: RegisteredAgent) => Effect.Effect<void, DuplicateAgent>
  readonly registerAll: (registrations: ReadonlyArray<RegisteredAgent>) => Effect.Effect<void, DuplicateAgent>
  readonly get: (name: string) => Effect.Effect<Option.Option<RegisteredAgent>>
  readonly getFor: (agent: AnyAgent) => Effect.Effect<Option.Option<RegisteredAgent>>
  readonly resolveCodeMode: (sandbox: string) => Effect.Effect<Option.Option<RegisteredAgent>>
}

interface RegisteredResolutionBinding {
  readonly agents: RegisteredAgents
  readonly registration: RegisteredAgent
}

const resolutionBindings = new WeakMap<Closed, RegisteredResolutionBinding>()
const programResolutionBindings = new WeakMap<ProgramResolution, RegisteredResolutionBinding>()

/** @internal Recover the exact registered revision metadata for one resolved Agent closure. */
export const executionBinding = (agent: Closed): Option.Option<RegisteredExecutionBinding> => {
  const bound = resolutionBindings.get(agent)
  if (bound?.registration.executionServices === undefined) return Option.none()
  return Option.some({
    agents: bound.agents,
    registration: bound.registration,
    base: bound.registration.context,
    executionServices: bound.registration.executionServices.factory,
    partition: bound.registration.executionServices.partition,
  })
}

/** @internal Recover the exact registry which produced one resolved Agent closure. */
export const registeredResolution = (agent: Closed): Option.Option<RegisteredResolutionBinding> =>
  Option.fromUndefinedOr(resolutionBindings.get(agent))

/** @internal Recover the registered revision which lowered one declared CodeMode Program. */
export const registeredProgramResolution = (
  resolution: ProgramResolution,
): Option.Option<RegisteredResolutionBinding> => Option.fromUndefinedOr(programResolutionBindings.get(resolution))

/** @internal Construct one registry synchronously so host Layers can share it without exposing another service. */
export const make = (): RegisteredAgents => {
  const entries = new Map<string, RegisteredAgent>()
  const tools = new Map<string, RegisteredTool>()
  const codeModes = new Map<string, RegisteredAgent>()
  const registerAll = (registrations: ReadonlyArray<RegisteredAgent>) =>
    Effect.suspend(() => {
      const names = new Set<string>()
      for (const registration of registrations) {
        if (names.has(registration.name) || entries.has(registration.name)) {
          return Effect.fail(DuplicateAgent.make({ agentName: registration.name }))
        }
        names.add(registration.name)
      }
      for (const registration of registrations) {
        entries.set(registration.name, registration)
        resolutionBindings.set(registration.agent, { agents: registry, registration })
        if (registration.codeMode !== undefined) {
          codeModes.set(registration.codeMode.identity.authority.sandbox, registration)
        }
      }
      return Effect.void
    })
  const registry: RegisteredAgents = {
    registerTool: (registration) =>
      Effect.suspend(() => {
        const pin = registration.resolution.pinned.pin
        const existing = tools.get(pin)
        if (existing !== undefined) {
          return existing.source === registration.source
            ? Effect.void
            : ExecutableRegistrationInvalid.make({ message: `Tool identity is already registered: ${pin}` })
        }
        tools.set(pin, registration)
        return Effect.void
      }),
    getTool: (tool) =>
      Effect.sync(() => Option.fromUndefinedOr([...tools.values()].find((entry) => entry.source === tool))),
    resolveTool: (pin) => Effect.sync(() => Option.fromUndefinedOr(tools.get(pin))),
    register: (registration) => registerAll([registration]),
    registerAll,
    get: (name) => Effect.sync(() => Option.fromUndefinedOr(entries.get(name))),
    getFor: (agent) =>
      Effect.sync(() => {
        const registration = entries.get(agent.name)
        return Option.fromUndefinedOr(registration?.registeredFrom === agent ? registration : undefined)
      }),
    resolveCodeMode: (sandbox) => Effect.sync(() => Option.fromUndefinedOr(codeModes.get(sandbox))),
  }
  return registry
}

type ErasedAgent = Agent<Record<string, Tool.Any>, unknown, unknown, unknown, Schema.Top, Schema.Top>

interface AgentGraph {
  readonly agents: ReadonlyArray<AnyAgent>
  readonly children: ReadonlyMap<AnyAgent, ReadonlyArray<{ readonly selection: string; readonly agent: AnyAgent }>>
}

export class AgentProfiles extends Context.Service<AgentProfiles, ReadonlyArray<AnyAgent>>()(
  "generalist/runtime/executable/registered-agent/AgentProfiles",
) {}

/** @internal Late-bound factory metadata supplied only while Runtime.layer registers a revision. */
export class AgentExecutionServices extends Context.Service<
  AgentExecutionServices,
  { readonly factory: ErasedExecutionServicesFactory; readonly partition: string }
>()("generalist/runtime/executable/registered-agent/AgentExecutionServices") {}

/** @internal Runtime partition retained while registering exact CodeMode child authority. */
export class AgentRuntimePartition extends Context.Service<AgentRuntimePartition, string>()(
  "generalist/runtime/executable/registered-agent/AgentRuntimePartition",
) {}

export { AgentBuildRevision } from "./build-revision.js"

const graphFor = (root: AnyAgent, available: ReadonlyArray<AnyAgent> = [root]): AgentGraph => {
  const agents: Array<AnyAgent> = []
  const children = new Map<AnyAgent, ReadonlyArray<{ readonly selection: string; readonly agent: AnyAgent }>>()
  const names = new Map<string, AnyAgent>()
  const profiles = new Map<string, AnyAgent>()
  const visited = new Set<AnyAgent>()
  const availableByName = new Map<string, AnyAgent>()
  for (const agent of available) {
    if (availableByName.has(agent.name)) throw new TypeError(`Duplicate Agent profile: ${agent.name}`)
    availableByName.set(agent.name, agent)
  }
  const codeModeAgents = (agent: AnyAgent): ReadonlyArray<AnyAgent> => {
    if (agent.codeMode === undefined) return []
    return agent.codeMode.agents.map((grant) => grant.agent)
  }
  const visit = (agent: AnyAgent): void => {
    if (visited.has(agent)) return
    const named = names.get(agent.name)
    if (named !== undefined && named !== agent)
      throw new TypeError(`Duplicate Agent name in fan-out graph: ${agent.name}`)
    names.set(agent.name, agent)
    visited.add(agent)
    agents.push(agent)
    const declared: Array<{ readonly selection: string; readonly agent: AnyAgent }> = []
    const selections = new Set<string>()
    for (const selection of agent.children) {
      const child = availableByName.get(selection)
      if (child === undefined) throw new TypeError(`Unknown child profile '${selection}' declared by ${agent.name}`)
      const profiled = profiles.get(selection)
      if (profiled !== undefined && profiled !== child) throw new TypeError(`Conflicting child profile '${selection}'`)
      profiles.set(selection, child)
      declared.push({ selection, agent: child })
      selections.add(selection)
      visit(child)
    }
    for (const tool of Object.values(agent.toolkit.tools)) {
      const fanOut = fanOutDefinition(tool)
      if (fanOut === undefined) continue
      for (const [selection, child] of Object.entries(fanOut.agents)) {
        const profiled = profiles.get(selection)
        if (profiled !== undefined && profiled !== child) {
          throw new TypeError(`Fan-out selection '${selection}' resolves to more than one Agent`)
        }
        profiles.set(selection, child)
        if (!selections.has(selection)) {
          declared.push({ selection, agent: child })
          selections.add(selection)
        }
        visit(child)
      }
    }
    for (const granted of codeModeAgents(agent)) visit(granted)
    children.set(agent, declared)
  }
  visit(root)
  return { agents, children }
}

export const validateProfiles = (agents: ReadonlyArray<AnyAgent>): Effect.Effect<void, ExecutableRegistrationInvalid> =>
  Effect.try({
    try: () => {
      for (const agent of agents) graphFor(agent, agents)
    },
    catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
  })

const pinnedAgent = (
  agent: AnyAgent,
  children: ReadonlyArray<{ readonly selection: string }>,
  hooks: CapabilityPin | undefined,
  revision: string,
  programAuthority?: import("../../core/durable/manifest/agent-manifest.js").ProgramAuthority,
) => {
  const hidden: unknown = agent
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: Agent.Any hides only invariant type parameters; every graph member originates from Agent.make.
  const erased = hidden as ErasedAgent
  return fromLiveAgent(erased, {
    model: makeModel({
      runtime: "registered-agent",
      agent: agent.name,
      selection: agent.model ?? null,
      revision,
    }),
    tools: Object.keys(agent.toolkit.tools).map((name) => ({
      name,
      pin: makeCapability({ runtime: "registered-agent", revision, agent: agent.name, tool: name }),
    })),
    skills: [],
    services: [
      ...(hooks === undefined ? [] : [{ name: "hooks", pin: hooks }]),
      ...new Map(
        Object.values(agent.toolkit.tools).flatMap((tool) => {
          const component = Context.getOption(tool.annotations, CommandTool)
          if (Option.isNone(component)) return []
          const name = `component:${namespace(component.value.descriptor)}`
          return [[name, { name, pin: component.value.pin }] as const]
        }),
      ).values(),
    ],
    policy:
      agent.policy.snapshot === undefined
        ? {
            _tag: "Pinned",
            pin: makeCapability({ runtime: "registered-agent", revision, agent: agent.name, policy: "1" }),
          }
        : { _tag: "Portable", policy: agent.policy.snapshot },
    budget: agent.budget ?? {},
    children,
    ...Object.assign({}, programAuthority === undefined ? undefined : { programAuthority }),
  })
}

const graphIdentities = (
  root: AnyAgent,
  additionalTools: ReadonlyArray<Tool.Any> = [],
  hooks?: CapabilityPin,
  available?: ReadonlyArray<AnyAgent>,
  revision = "1",
) => {
  const graph = graphFor(root, available)
  const declarations = new Map(
    graph.agents.flatMap((agent) =>
      agent.codeMode === undefined ? [] : ([[agent, Effect.runSync(validateCodeMode(agent, agent.codeMode))]] as const),
    ),
  )
  const implementations = new Map(
    graph.agents.map((agent) => {
      if (additionalTools.length === 0) return [agent, agent] as const
      const hidden: unknown = agent
      // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: graphFor accepts only Agent definitions and erases their invariant parameters.
      return [agent, withTools(hidden as ErasedAgent, additionalTools)] as const
    }),
  )
  const pinned = new Map<AnyAgent, ReturnType<typeof pinnedAgent>>()
  const codeModes = new Map<
    AnyAgent,
    {
      readonly declaration: import("../code-mode/declaration.js").ValidatedDeclaration
      readonly identity: ReturnType<typeof deriveIdentity>
    }
  >()
  const visiting = new Set<AnyAgent>()
  const pinAgent = (agent: AnyAgent): ReturnType<typeof pinnedAgent> => {
    const current = pinned.get(agent)
    if (current !== undefined) return current
    if (visiting.has(agent)) throw new TypeError(`CodeMode Agent grants cannot contain a cycle: ${agent.name}`)
    visiting.add(agent)
    const declaration = declarations.get(agent)
    let codeMode: ReturnType<typeof deriveIdentity> | undefined
    if (declaration !== undefined) {
      const granted = new Map(declaration.agents.map(({ agent: child }) => [child, pinAgent(child)] as const))
      codeMode = deriveIdentity({ owner: agent, declaration, revision, agents: granted })
      codeModes.set(agent, { declaration, identity: codeMode })
    }
    const result = pinnedAgent(
      implementations.get(agent)!,
      (graph.children.get(agent) ?? []).map(({ selection }) => ({ selection })),
      hooks,
      revision,
      codeMode?.authority,
    )
    visiting.delete(agent)
    pinned.set(agent, result)
    return result
  }
  for (const agent of graph.agents) pinAgent(agent)
  const profiles = new Map<string, AnyAgent>()
  for (const declared of graph.children.values()) {
    for (const child of declared) {
      const current = profiles.get(child.selection)
      if (current !== undefined && current !== child.agent) {
        throw new TypeError(`Agent selection '${child.selection}' resolves to more than one Agent`)
      }
      profiles.set(child.selection, child.agent)
    }
  }
  const executableInput = {
    root: pinned.get(root)!.pin,
    profiles: [...profiles].map(([selection, agent]) => ({ selection, agent: pinned.get(agent)!.pin })),
    entries: graph.agents.map((agent) => ({ _tag: "Agent" as const, ...pinned.get(agent)! })),
  }
  const executable = makeExecutable(executableInput)
  const codeModeOwners = new Map<string, string>(
    [...codeModes].map(([agent, declaration]) => [declaration.identity.authority.sandbox, agent.name] as const),
  )
  const registrations = [...requiredPins(executable)].map((capabilityPin) => {
    const ownerAgentName = codeModeOwners.get(capabilityPin)
    return {
      pin: capabilityPin,
      codec,
      version,
      payload:
        ownerAgentName === undefined
          ? { pin: capabilityPin, revision }
          : { pin: capabilityPin, revision, ownerAgentName },
    }
  })
  return {
    graph,
    implementations,
    codeModes,
    identities: new Map(
      graph.agents.map(
        (agent) =>
          [
            agent,
            {
              executable: makeExecutable({ ...executableInput, active: pinned.get(agent)!.pin }),
              registrations,
            },
          ] as const,
      ),
    ),
  }
}

/** @internal Derive the persisted identity used for typed Agent admission and recovery tests. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Internal identity derivation supports direct overloads for legacy profile and revision callers.
export const durableIdentity: {
  (profiles: ReadonlyArray<AnyAgent>): (agent: AnyAgent) => Pick<RegisteredAgent, "executable" | "registrations">
  (agent: AnyAgent): Pick<RegisteredAgent, "executable" | "registrations">
  (agent: AnyAgent, profiles: ReadonlyArray<AnyAgent>): Pick<RegisteredAgent, "executable" | "registrations">
  (
    agent: AnyAgent,
    profiles: ReadonlyArray<AnyAgent>,
    revision: string,
  ): Pick<RegisteredAgent, "executable" | "registrations">
} = Function.dual(
  (args) => !Array.isArray(args[0]),
  (agent: AnyAgent, profiles?: ReadonlyArray<AnyAgent>, revision = "1") =>
    // oxlint-disable-next-line typescript/no-unsafe-argument -- Function.dual erases the optional profile argument while the overloads preserve its concrete type at every call site.
    graphIdentities(agent, [], undefined, profiles, revision).identities.get(agent)!,
)

/** @internal Close an Agent over the registration call's exact environment and derive its durable admission identity. */
const registered = (
  registeredFrom: AnyAgent,
  implementation: AnyAgent,
  context: Context.Context<unknown>,
  identity: ReturnType<typeof durableIdentity>,
  codeMode?: RegisteredCodeMode,
  partition?: string,
  executionServices?: RegisteredAgent["executionServices"],
): RegisteredAgent => {
  const hiddenAgent: unknown = implementation
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: Agent.Any hides only invariant type parameters; every registered member originates from Agent.make.
  const erased = hiddenAgent as ErasedAgent
  const hiddenEnvironment: unknown = Layer.succeedContext(context)
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: ordinary capture supplies the complete environment. Execution-bound capture records its statically covered base separately; run-executor-internal replaces this placeholder with the merged per-attempt environment before any Agent path builds it.
  const environment = hiddenEnvironment as Layer.Layer<
    ClosedServices<Record<string, Tool.Any>, unknown, Schema.Top, Schema.Top>
  >
  const registration: RegisteredAgent = {
    name: implementation.name,
    registeredFrom,
    source: implementation,
    agent: close(erased, environment),
    context,
    executable: identity.executable,
    registrations: identity.registrations,
    ...Object.assign({}, codeMode === undefined ? undefined : { codeMode }),
    ...Object.assign({}, partition === undefined ? undefined : { partition }),
  }
  return executionServices === undefined ? registration : { ...registration, executionServices }
}

const captureFrom = (
  agent: AnyAgent,
  context: Context.Context<unknown>,
  options: {
    readonly profiles?: ReadonlyArray<AnyAgent>
    readonly revision?: string
    readonly partition?: string
    readonly executionServices?: RegisteredAgent["executionServices"]
  } = {},
): Effect.Effect<ReadonlyArray<RegisteredAgent>, ExecutableRegistrationInvalid> =>
  Effect.gen(function* () {
    const tasks = Context.getOption(context, Tasks)
    const hooks = Context.getOption(context, Hooks)
    const profiles = options.profiles ?? Option.getOrUndefined(Context.getOption(context, AgentProfiles))
    const revision = options.revision ?? Option.getOrElse(Context.getOption(context, AgentBuildRevision), () => "1")
    const partition = options.partition ?? Option.getOrUndefined(Context.getOption(context, AgentRuntimePartition))
    const graph = yield* Effect.try({
      try: () =>
        graphIdentities(
          agent,
          Option.isSome(tasks) ? tasks.value.tools : [],
          Option.isSome(hooks) && hooks.value.declarations.length > 0 ? hooks.value.pin : undefined,
          profiles,
          revision,
        ),
      catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
    })
    return yield* Effect.forEach(
      graph.graph.agents.filter((member) => profiles === undefined || member === agent || !profiles.includes(member)),
      (member) =>
        Effect.gen(function* () {
          const declaration = graph.codeModes.get(member)
          if (declaration !== undefined && partition === undefined) {
            return yield* ExecutableRegistrationInvalid.make({
              message: "CodeMode registration requires the Runtime partition identity",
            })
          }
          const codeMode =
            declaration === undefined
              ? undefined
              : yield* bindCodeMode({
                  owner: member,
                  declaration: declaration.declaration,
                  identity: declaration.identity,
                  context,
                }).pipe(
                  Effect.mapError((error) =>
                    ExecutableRegistrationInvalid.make({
                      message: `CodeMode declaration ${error.field}/${error.reason}${error.name === undefined ? "" : `: ${error.name}`}`,
                    }),
                  ),
                )
          return registered(
            member,
            graph.implementations.get(member)!,
            context,
            graph.identities.get(member)!,
            codeMode,
            partition,
            options.executionServices,
          )
        }),
    )
  })

/** @internal Capture a registration over base services plus one late-bound execution factory. */
export const captureWithExecutionServices = (input: {
  readonly agent: AnyAgent
  readonly context: Context.Context<unknown>
  readonly profiles: ReadonlyArray<AnyAgent>
  readonly revision: string
  readonly factory: ErasedExecutionServicesFactory
  readonly partition: string
}): Effect.Effect<ReadonlyArray<RegisteredAgent>, ExecutableRegistrationInvalid> =>
  captureFrom(input.agent, input.context, {
    profiles: input.profiles,
    revision: input.revision,
    partition: input.partition,
    executionServices: { factory: input.factory, partition: input.partition },
  })

/** @internal Capture the exact services required by one Agent registration. */
export const capture = <
  Tools extends Record<string, Tool.Any>,
  R,
  PolicyServices extends R,
  AuthorizationServices extends R,
  InputCodec extends Schema.Top,
  OutputCodec extends Schema.Top,
>(
  agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
): Effect.Effect<
  ReadonlyArray<RegisteredAgent>,
  ExecutableRegistrationInvalid,
  ClosedServices<Tools, R, InputCodec, OutputCodec>
> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<ClosedServices<Tools, R, InputCodec, OutputCodec>>()
    const executionServices = yield* Effect.serviceOption(AgentExecutionServices)
    const erasedContext = Context.makeUnsafe<unknown>(context.mapUnsafe)
    return yield* captureFrom(agent, erasedContext, {
      executionServices: Option.getOrUndefined(executionServices),
    })
  })

const registeredName = (input: ResolverInput): Effect.Effect<string, ExecutablePinMissing> => {
  const active = input.manifest.entries.find((entry) => entry.pin === input.ref.active)
  return active?._tag === "Agent"
    ? Effect.succeed(active.manifest.name)
    : Effect.fail(ExecutablePinMissing.make({ runId: input.runId, ref: input.ref }))
}

const BudgetFields = [
  "agentRuns",
  "concurrency",
  "toolCalls",
  "tokens",
  "wallClockMillis",
  "logBytes",
  "outputBytes",
] as const

const CodeModeRegistrationPayload = Schema.Struct({
  pin: Schema.String,
  revision: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
  ownerAgentName: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)),
})

const validateCodeModeRegistration = (
  registration: RegisteredAgent,
  input: ResolverInput,
  sandbox: string,
): Effect.Effect<void, ExecutableRegistrationInvalid> =>
  Effect.gen(function* () {
    const persisted = input.registrations.find((entry) => entry.pin === sandbox)
    const expected = registration.registrations.find((entry) => entry.pin === sandbox)
    if (
      persisted === undefined ||
      expected === undefined ||
      persisted.codec !== codec ||
      expected.codec !== codec ||
      persisted.version !== version ||
      expected.version !== version
    ) {
      return yield* ExecutableRegistrationInvalid.make({
        message: "CodeMode Program has no exact owner registration",
      })
    }
    const persistedPayload = Schema.decodeUnknownOption(CodeModeRegistrationPayload, {
      onExcessProperty: "error",
    })(persisted.payload)
    const expectedPayload = Schema.decodeUnknownOption(CodeModeRegistrationPayload, {
      onExcessProperty: "error",
    })(expected.payload)
    if (
      Option.isNone(persistedPayload) ||
      Option.isNone(expectedPayload) ||
      persistedPayload.value.pin !== sandbox ||
      expectedPayload.value.pin !== sandbox ||
      persistedPayload.value.ownerAgentName !== registration.name ||
      expectedPayload.value.ownerAgentName !== registration.name ||
      persistedPayload.value.revision !== expectedPayload.value.revision
    ) {
      return yield* ExecutableRegistrationInvalid.make({
        message: "CodeMode Program owner registration does not match its registered revision",
      })
    }
  })

const matchesProgramBoundary = (
  program: ReturnType<typeof makeProgramManifest>,
  closure: RegisteredCodeMode,
): boolean => {
  const authority = closure.identity.authority
  return (
    program.manifest.sandbox === authority.sandbox &&
    program.manifest.input === authority.input &&
    program.manifest.output === authority.output
  )
}

const resolveCodeModeProgram = (
  agents: RegisteredAgents,
  registration: RegisteredAgent,
  input: ResolverInput,
): Effect.Effect<ProgramResolution, ExecutableRegistrationInvalid> =>
  Effect.gen(function* () {
    const closure = registration.codeMode
    if (closure === undefined) {
      return yield* ExecutableRegistrationInvalid.make({ message: "CodeMode registration closure is missing" })
    }
    yield* validateCodeModeRegistration(registration, input, closure.identity.authority.sandbox)
    const executorMatches = yield* Effect.sync(() => {
      try {
        return pinDigest(closure.executor.identity) === pinDigest(closure.declaration.executor)
      } catch {
        return false
      }
    })
    if (!executorMatches) {
      return yield* ExecutableRegistrationInvalid.make({
        message: "CodeMode executor identity differs from its registered declaration",
      })
    }
    const active = input.manifest.entries.find((entry) => entry.pin === input.ref.active)
    if (active?._tag !== "Program") {
      return yield* ExecutableRegistrationInvalid.make({ message: "CodeMode active executable is not a Program" })
    }
    const program = yield* Effect.try({
      try: () => makeProgramManifest(active.manifest),
      catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
    })
    if (program.pin !== active.pin) {
      return yield* ExecutableRegistrationInvalid.make({ message: "CodeMode Program pin does not match its manifest" })
    }
    const authority = closure.identity.authority
    if (!matchesProgramBoundary(program, closure)) {
      return yield* ExecutableRegistrationInvalid.make({
        message: "CodeMode Program boundary identity exceeds its registered declaration",
      })
    }
    if (new TextEncoder().encode(program.manifest.source.text).byteLength > authority.maxSourceBytes) {
      return yield* ExecutableRegistrationInvalid.make({ message: "CodeMode Program source exceeds its declaration" })
    }
    for (const field of BudgetFields) {
      if (program.manifest.budget[field] > authority.budget[field]) {
        return yield* ExecutableRegistrationInvalid.make({
          message: `CodeMode Program ${field} exceeds its registered declaration`,
        })
      }
    }
    const full = closure.handlers(input.runId)
    const select = <A>(
      kind: "tool" | "step",
      declared: ReadonlyArray<{ readonly name: string; readonly pin: string }>,
      available: ReadonlyArray<A>,
      nameOf: (value: A) => string,
      pinOf: (value: A) => string,
    ): Effect.Effect<ReadonlyArray<A>, ExecutableRegistrationInvalid> =>
      Effect.gen(function* () {
        const byName = new Map(available.map((value) => [nameOf(value), value] as const))
        const selected: Array<A> = []
        for (const capability of declared) {
          const handler = byName.get(capability.name)
          if (handler === undefined || pinOf(handler) !== capability.pin) {
            return yield* ExecutableRegistrationInvalid.make({
              message: `CodeMode Program ${kind} is outside its registered declaration: ${capability.name}`,
            })
          }
          selected.push(handler)
        }
        return selected
      })
    const tools = yield* select(
      "tool",
      program.manifest.capabilities.tools,
      full.tools,
      ({ name }) => name,
      ({ pin }) => pin,
    )
    const steps = yield* select(
      "step",
      program.manifest.capabilities.steps,
      full.steps,
      ({ name }) => name,
      ({ pin }) => pin,
    )
    const agentsBySelection = new Map(full.agents.map((handler) => [handler.selection, handler] as const))
    const selectedAgents: Array<(typeof full.agents)[number]> = []
    for (const capability of program.manifest.capabilities.agents) {
      const handler = agentsBySelection.get(capability.selection)
      if (handler === undefined || handler.agent !== capability.agent || handler.inputPin !== capability.input) {
        return yield* ExecutableRegistrationInvalid.make({
          message: `CodeMode Program Agent is outside its registered declaration: ${capability.selection}`,
        })
      }
      selectedAgents.push(handler)
    }
    const handlers = yield* Effect.try({
      try: () => makeProgramHandlers({ tools, steps, agents: selectedAgents }),
      catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
    })
    yield* validateProgramHandlers(program, handlers).pipe(
      Effect.mapError((error) =>
        ExecutableRegistrationInvalid.make({
          message: `CodeMode Program ${error.kind} handler ${error.handlerName} ${error.reason}`,
        }),
      ),
    )
    const resolution: ProgramResolution = {
      _tag: "Program",
      program: {
        pinned: program,
        input: closure.input,
        output: closure.output,
      } satisfies Program<unknown, unknown, unknown, unknown>,
      executor: closure.executor,
      handlers,
      attestation: { ref: input.ref, manifest: input.manifest },
    }
    programResolutionBindings.set(resolution, { agents, registration })
    return resolution
  })

type ResolveEffect = Effect.Effect<
  Resolution,
  ExecutablePinMissing | ExecutableRegistrationInvalid | ExecutableRegistrationMissing | UnknownAgent,
  Scope.Scope
>

/** @internal Resolve registered Agent declarations exactly; other executable codecs belong to the host resolver. */
export const resolve: {
  (fallback: ResolverService, input: ResolverInput): (agents: RegisteredAgents) => ResolveEffect
  (agents: RegisteredAgents, fallback: ResolverService, input: ResolverInput): ResolveEffect
} = Function.dual(3, (agents: RegisteredAgents, fallback: ResolverService, input: ResolverInput): ResolveEffect => {
  const activeEntry = input.manifest.entries.find((entry) => entry.pin === input.ref.active)
  if (activeEntry?._tag === "Program") {
    return Effect.flatMap(agents.resolveCodeMode(activeEntry.manifest.sandbox), (registration) => {
      if (Option.isNone(registration)) return fallback.resolve(input)
      if (input.registrations.some((entry) => entry.codec !== codec || entry.version !== version)) {
        return ExecutableRegistrationInvalid.make({
          message: "Declared CodeMode Programs require one complete exact-revision registration set.",
        })
      }
      return resolveCodeModeProgram(agents, registration.value, input)
    })
  }
  if (input.registrations.some((registration) => registration.codec === toolCodec)) {
    return Effect.gen(function* () {
      if (input.registrations.some((registration) => registration.codec !== toolCodec || registration.version !== "1"))
        return yield* ExecutableRegistrationInvalid.make({
          message: "Tool declarations require one complete version-1 registration set.",
        })
      const registration = yield* agents.resolveTool(input.ref.active)
      if (Option.isNone(registration)) return yield* fallback.resolve(input)
      return registration.value.resolution
    })
  }
  if (!input.registrations.some((registration) => registration.codec === codec)) return fallback.resolve(input)
  if (input.registrations.some((registration) => registration.codec !== codec || registration.version !== version)) {
    return ExecutableRegistrationInvalid.make({
      message: "Registered Agent declarations require one complete version-1 registration set.",
    })
  }
  return Effect.gen(function* () {
    const name = yield* registeredName(input)
    const registration = yield* agents.get(name)
    if (Option.isNone(registration)) {
      return yield* fallback
        .resolve(input)
        .pipe(
          Effect.catchTag("generalist/runtime/ExecutablePinMissing", () =>
            UnknownAgent.make({ agentName: name, runId: input.runId }),
          ),
        )
    }
    const root = input.manifest.entries.find((entry) => entry.pin === input.manifest.root)
    const rootRegistration = root?._tag === "Agent" ? yield* agents.get(root.manifest.name) : Option.none()
    const executable = Option.isSome(rootRegistration)
      ? rootRegistration.value.executable
      : registration.value.executable
    if (executable.ref.executable !== input.ref.executable) return yield* fallback.resolve(input)
    const resolvedEntry = executable.manifest.entries.find(
      (entry) => entry._tag === "Agent" && entry.manifest.name === name,
    )
    if (resolvedEntry === undefined) return yield* ExecutablePinMissing.make({ runId: input.runId, ref: input.ref })
    return {
      _tag: "Agent" as const,
      agent: registration.value.agent,
      attestation: makeExecutable({ ...executable.manifest, active: resolvedEntry.pin }),
    }
  })
})
