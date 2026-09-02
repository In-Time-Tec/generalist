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
  readonly get: (name: string) => Effect.Effect<Option.Option<RegisteredAgent>>
  readonly getFor: (agent: AnyAgent) => Effect.Effect<Option.Option<RegisteredAgent>>
}

/** @internal Construct one registry synchronously so host Layers can share it without exposing another service. */
export const make = (): RegisteredAgents => {
  const entries = new Map<string, RegisteredAgent>()
  return {
    register: (registration) =>
      Effect.suspend(() => {
        if (entries.has(registration.name)) {
          return Effect.fail(DuplicateAgent.make({ name: registration.name }))
        }
        entries.set(registration.name, registration)
        return Effect.void
      }),
    get: (name) => Effect.sync(() => Option.fromUndefinedOr(entries.get(name))),
    getFor: (agent) =>
      Effect.sync(() => {
        const registration = entries.get(agent.name)
        return Option.fromUndefinedOr(registration?.source === agent ? registration : undefined)
      }),
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
) => {
  const durable = fromLiveAgent(agent, {
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
    children: [],
  })
  const executable = makeExecutable({ root: durable.pin, entries: [{ _tag: "Agent", ...durable }] })
  return {
    executable,
    registrations: [...requiredPins(executable)].map((pin) => ({
      pin,
      codec,
      version,
      payload: { agent: agent.name },
    })),
  }
}

/** @internal Close an Agent over the registration call's exact environment and derive its durable admission identity. */
const registered = <
  Tools extends Record<string, Tool.Any>,
  R,
  PolicyServices extends R,
  AuthorizationServices extends R,
  InputCodec extends Schema.Top,
  OutputCodec extends Schema.Top,
>(
  agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
  context: Context.Context<ClosedServices<Tools, R, InputCodec, OutputCodec>>,
): RegisteredAgent => {
  const identity = durableIdentity(agent)
  return {
    name: agent.name,
    source: agent,
    agent: close(agent, Layer.succeedContext(context)),
    // The exact Agent object check in getFor confines this erased context to the schemas that declared its services.
    context: Context.makeUnsafe<unknown>(context.mapUnsafe),
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
): Effect.Effect<RegisteredAgent, never, ClosedServices<Tools, R, InputCodec, OutputCodec>> =>
  Effect.context<ClosedServices<Tools, R, InputCodec, OutputCodec>>().pipe(
    Effect.map((context) => registered(agent, context)),
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
