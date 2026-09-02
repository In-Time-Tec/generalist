import { Context, Effect, Function, Layer, Option, Schema, type Scope } from "effect"
import type { Tool } from "effect/unstable/ai"
import { fromLiveAgent } from "../../core/durable/manifest/agent-manifest.js"
import { makeCapability, makeModel } from "../../core/durable/pin.js"
import {
  close,
  type Agent,
  type Any as AnyAgent,
  type Closed,
  type ClosedServices,
} from "../../core/agent/lifecycle/definition.js"
import {
  DuplicateAgent,
  ExecutablePinMissing,
  type ExecutableRegistrationInvalid,
  type ExecutableRegistrationMissing,
  UnknownAgent,
} from "../errors.js"
import { make as makeExecutable } from "./manifest.js"
import type { Input as ResolverInput, Resolution, Service as ResolverService } from "./resolver.js"
import { requiredPins, type ExecutableRegistration } from "./registration.js"
import { definition as fanOutDefinition } from "../../core/agent/tool/fan-out.js"

const codec = "generalist/runtime/registered-agent"
const version = "1"

/** @internal One process-local Agent registration paired with its durable admission identity. */
export interface RegisteredAgent {
  readonly name: string
  readonly source: AnyAgent
  readonly agent: Closed
  readonly context: Context.Context<unknown>
  readonly executable: import("./manifest.js").PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

/** @internal Process-local authority shared by one Runtime service and its executor. */
export interface RegisteredAgents {
  readonly register: (registration: RegisteredAgent) => Effect.Effect<void, DuplicateAgent>
  readonly registerAll: (registrations: ReadonlyArray<RegisteredAgent>) => Effect.Effect<void, DuplicateAgent>
  readonly get: (name: string) => Effect.Effect<Option.Option<RegisteredAgent>>
  readonly getFor: (agent: AnyAgent) => Effect.Effect<Option.Option<RegisteredAgent>>
}

/** @internal Construct one registry synchronously so host Layers can share it without exposing another service. */
export const make = (): RegisteredAgents => {
  const entries = new Map<string, RegisteredAgent>()
  const registerAll = (registrations: ReadonlyArray<RegisteredAgent>) =>
    Effect.suspend(() => {
      const names = new Set<string>()
      for (const registration of registrations) {
        if (names.has(registration.name) || entries.has(registration.name)) {
          return Effect.fail(DuplicateAgent.make({ name: registration.name }))
        }
        names.add(registration.name)
      }
      for (const registration of registrations) entries.set(registration.name, registration)
      return Effect.void
    })
  return {
    register: (registration) => registerAll([registration]),
    registerAll,
    get: (name) => Effect.sync(() => Option.fromUndefinedOr(entries.get(name))),
    getFor: (agent) =>
      Effect.sync(() => {
        const registration = entries.get(agent.name)
        return Option.fromUndefinedOr(registration?.source === agent ? registration : undefined)
      }),
  }
}

type ErasedAgent = Agent<Record<string, Tool.Any>, unknown, unknown, unknown, Schema.Top, Schema.Top>

interface AgentGraph {
  readonly agents: ReadonlyArray<AnyAgent>
  readonly children: ReadonlyMap<AnyAgent, ReadonlyArray<{ readonly selection: string; readonly agent: AnyAgent }>>
}

const graphFor = (root: AnyAgent): AgentGraph => {
  const agents: Array<AnyAgent> = []
  const children = new Map<AnyAgent, ReadonlyArray<{ readonly selection: string; readonly agent: AnyAgent }>>()
  const names = new Map<string, AnyAgent>()
  const profiles = new Map<string, AnyAgent>()
  const visited = new Set<AnyAgent>()
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
    children.set(agent, declared)
  }
  visit(root)
  return { agents, children }
}

const pinnedAgent = (agent: AnyAgent, children: ReadonlyArray<{ readonly selection: string }>) => {
  const hidden: unknown = agent
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: Agent.Any hides only invariant type parameters; every graph member originates from Agent.make.
  const erased = hidden as ErasedAgent
  return fromLiveAgent(erased, {
    model: makeModel({
      runtime: "registered-agent",
      agent: agent.name,
      selection: agent.model ?? null,
    }),
    tools: Object.keys(agent.toolkit.tools).map((name) => ({
      name,
      pin: makeCapability({ runtime: "registered-agent", agent: agent.name, tool: name }),
    })),
    skills: [],
    services: [],
    policy:
      agent.policy.snapshot === undefined
        ? { _tag: "Pinned", pin: makeCapability({ runtime: "registered-agent", agent: agent.name, policy: "1" }) }
        : { _tag: "Portable", policy: agent.policy.snapshot },
    budget: agent.budget ?? {},
    children,
  })
}

const graphIdentities = (root: AnyAgent) => {
  const graph = graphFor(root)
  const pinned = new Map(
    graph.agents.map(
      (agent) =>
        [
          agent,
          pinnedAgent(
            agent,
            (graph.children.get(agent) ?? []).map(({ selection }) => ({ selection })),
          ),
        ] as const,
    ),
  )
  const profiles = new Map<string, AnyAgent>()
  for (const declared of graph.children.values()) {
    for (const child of declared) profiles.set(child.selection, child.agent)
  }
  const executableInput = {
    root: pinned.get(root)!.pin,
    profiles: [...profiles].map(([selection, agent]) => ({ selection, agent: pinned.get(agent)!.pin })),
    entries: graph.agents.map((agent) => ({ _tag: "Agent" as const, ...pinned.get(agent)! })),
  }
  const executable = makeExecutable(executableInput)
  const registrations = [...requiredPins(executable)].map((pin) => ({
    pin,
    codec,
    version,
    payload: { agent: root.name },
  }))
  return {
    graph,
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
export const durableIdentity = <
  Tools extends Record<string, Tool.Any>,
  R,
  PolicyServices extends R,
  AuthorizationServices extends R,
  InputCodec extends Schema.Top,
  OutputCodec extends Schema.Top,
>(
  agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
) => graphIdentities(agent).identities.get(agent)!

/** @internal Close an Agent over the registration call's exact environment and derive its durable admission identity. */
const registered = (
  agent: AnyAgent,
  context: Context.Context<unknown>,
  identity: ReturnType<typeof durableIdentity>,
): RegisteredAgent => {
  const hiddenAgent: unknown = agent
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: Agent.Any hides only invariant type parameters; every registered member originates from Agent.make.
  const erased = hiddenAgent as ErasedAgent
  const hiddenEnvironment: unknown = Layer.succeedContext(context)
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: capture obtains the root Agent's complete environment, including every declared fan-out child requirement, before graph erasure.
  const environment = hiddenEnvironment as Layer.Layer<
    ClosedServices<Record<string, Tool.Any>, unknown, Schema.Top, Schema.Top>
  >
  return {
    name: agent.name,
    source: agent,
    agent: close(erased, environment),
    context,
    executable: identity.executable,
    registrations: identity.registrations,
  }
}

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
): Effect.Effect<ReadonlyArray<RegisteredAgent>, never, ClosedServices<Tools, R, InputCodec, OutputCodec>> =>
  Effect.context<ClosedServices<Tools, R, InputCodec, OutputCodec>>().pipe(
    Effect.map((context) => {
      const graph = graphIdentities(agent)
      const erasedContext = Context.makeUnsafe<unknown>(context.mapUnsafe)
      return graph.graph.agents.map((member) => registered(member, erasedContext, graph.identities.get(member)!))
    }),
  )

const registeredInput = (input: ResolverInput): boolean =>
  input.registrations.length > 0 &&
  input.registrations.every((registration) => registration.codec === codec && registration.version === version)

const registeredName = (input: ResolverInput): Effect.Effect<string, ExecutablePinMissing> => {
  const active = input.manifest.entries.find((entry) => entry.pin === input.ref.active)
  return active?._tag === "Agent"
    ? Effect.succeed(active.manifest.name)
    : Effect.fail(ExecutablePinMissing.make({ runId: input.runId, ref: input.ref }))
}

type ResolveEffect = Effect.Effect<
  Resolution,
  ExecutablePinMissing | ExecutableRegistrationInvalid | ExecutableRegistrationMissing | UnknownAgent,
  Scope.Scope
>

/** @internal Resolve typed Runtime starts by persisted Agent name, falling back for legacy pinned executables. */
export const resolve: {
  (fallback: ResolverService, input: ResolverInput): (agents: RegisteredAgents) => ResolveEffect
  (agents: RegisteredAgents, fallback: ResolverService, input: ResolverInput): ResolveEffect
} = Function.dual(3, (agents: RegisteredAgents, fallback: ResolverService, input: ResolverInput): ResolveEffect => {
  if (!registeredInput(input)) return fallback.resolve(input)
  return Effect.gen(function* () {
    const name = yield* registeredName(input)
    const registration = yield* agents.get(name)
    if (Option.isNone(registration)) return yield* UnknownAgent.make({ name, runId: input.runId })
    return {
      _tag: "Agent" as const,
      agent: registration.value.agent,
      attestation: { ref: input.ref, manifest: input.manifest },
    }
  })
})
