/* oxlint-disable effecttsgo/any-unknown-in-error-context, typescript/no-unsafe-return -- Agent.Any intentionally hides invariant Agent parameters at the heterogeneous Host registry boundary; the distributive AgentDefinition/AgentServices types restore each configured Agent's exact contract. */
import { Effect, Filter, Option, Schema, Stream, Types } from "effect"
import { LanguageModel, Tool } from "effect/unstable/ai"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import {
  withTools,
  type Agent,
  type Any as AnyAgent,
  type ClosedServices,
  type Input as AgentInput,
  type Output as AgentOutput,
} from "../core/agent/service.js"
import { generateId } from "../core/model/telemetry/events.js"
import { Approvals } from "../core/policy/approvals.js"
import { Permissions } from "../core/policy/permissions.js"
import { ToolContext } from "../core/tools/tool-context.js"
import {
  SkillCatalog,
  merge as mergeSkillCatalogs,
  type Service as SkillCatalogService,
  type Skill,
} from "../core/context/skill-catalog.js"
import {
  Instructions,
  type Provider as InstructionProvider,
  type Service as InstructionsService,
} from "../instructions/providers.js"
import type { Cursor } from "../runtime/cursor.js"
import type {
  CreateSessionError,
  HostSession,
  HostSessionEvent,
  SessionError,
  SessionEventsError,
} from "../runtime/session/host.js"
import type { RunInspection } from "../runtime/run.js"
import type { RunEvent } from "../runtime/run/event.js"
import {
  Runtime,
  type CancelError,
  type InspectError,
  type RunHandle,
  type StartError,
  type StartOptions,
} from "../runtime/service.js"
import { DuplicateAgent, type RuntimeUnavailable } from "../runtime/errors.js"

export type { HostSession } from "../runtime/session/host.js"
export {
  SessionNotFound,
  SessionConflict,
  SessionCursorExpired,
  SessionSubscriberLagged,
} from "../runtime/session/host.js"

/** A plugin name was declared more than once in one host. */
export class PluginNameConflict extends ActionableTaggedError<PluginNameConflict>()(
  "generalist/host/PluginNameConflict",
  {
    name: Schema.String,
    hint: errorHint("Give each host plugin a unique name."),
  },
) {}

/** Two host declarations attempted to install the same static tool name. */
export class PluginToolConflict extends ActionableTaggedError<PluginToolConflict>()(
  "generalist/host/PluginToolConflict",
  {
    name: Schema.String,
    sources: Schema.Array(Schema.String),
    hint: errorHint("Rename or remove one of the colliding static tools."),
  },
) {}

/** A Run start used an Agent that was not configured on this host. */
export class AgentNotRegistered extends ActionableTaggedError<AgentNotRegistered>()(
  "generalist/host/AgentNotRegistered",
  {
    name: Schema.String,
    hint: errorHint("Pass an Agent from the agents array supplied to Generalist.create."),
  },
) {}

/** One deterministic collection of host-owned Agent contributions. Hooks are added by #348. */
export interface Plugin<Tools extends ReadonlyArray<Tool.Any> = ReadonlyArray<never>> {
  readonly name: string
  readonly tools?: Tools
  readonly instructions?: ReadonlyArray<InstructionProvider>
  readonly skills?: ReadonlyArray<Skill>
}

export interface PluginOptions<Tools extends ReadonlyArray<Tool.Any> = ReadonlyArray<never>> {
  readonly name: string
  readonly tools?: Tools
  readonly instructions?: ReadonlyArray<InstructionProvider>
  readonly skills?: ReadonlyArray<Skill>
}

export interface CreateOptions<
  Agents extends ReadonlyArray<AnyAgent>,
  Plugins extends ReadonlyArray<Plugin<ReadonlyArray<Tool.Any>>> = ReadonlyArray<never>,
> {
  readonly agents: Agents
  readonly plugins?: Plugins
}

export interface SessionCreateOptions {
  readonly id?: string
  readonly title?: string
}

export interface RunStartOptions {
  readonly idempotencyKey?: string
}

type EventWithTag<Tag extends RunEvent["_tag"]> = Extract<RunEvent, { readonly _tag: Tag }>
type TurnEvent = EventWithTag<"TurnStarted" | "TurnCompleted">
type ToolCallEvent = EventWithTag<
  "ToolExecutionStarted" | "ToolProgress" | "ToolExecutionCompleted" | "ToolExecutionWaiting"
>
type ApprovalRequestedEvent = EventWithTag<"ApprovalRequested">
type CompactedEvent = EventWithTag<"CompactionApplied">
type CompletedEvent = EventWithTag<"RunCompleted" | "RunFailed" | "RunCancelled">

interface HostEventBase<Tag extends string, Event extends RunEvent> {
  readonly _tag: Tag
  readonly sessionId: string
  readonly cursor: Cursor
  readonly runId: string
  readonly event: Event
}

export type RunStarted = HostEventBase<"RunStarted", EventWithTag<"RunAccepted">>
export type Turn = HostEventBase<"Turn", TurnEvent>
export type ToolCall = HostEventBase<"ToolCall", ToolCallEvent>
export type ApprovalRequested = HostEventBase<"ApprovalRequested", ApprovalRequestedEvent>
export type Compacted = HostEventBase<"Compacted", CompactedEvent>
export type Completed = HostEventBase<"Completed", CompletedEvent>
export type HostEvent = RunStarted | Turn | ToolCall | ApprovalRequested | Compacted | Completed

export type HostRun<Output> = Omit<RunHandle<Output>, "runId"> & { readonly id: RunHandle<Output>["runId"] }

export interface Host<Agents extends ReadonlyArray<AnyAgent>> {
  readonly sessions: {
    readonly create: (options?: SessionCreateOptions) => Effect.Effect<HostSession, CreateSessionError>
    readonly get: (sessionId: string) => Effect.Effect<HostSession, SessionError>
    readonly list: () => Effect.Effect<ReadonlyArray<HostSession>, RuntimeUnavailable>
  }
  readonly runs: {
    readonly start: <Selected extends Agents[number]>(
      sessionId: string,
      agent: Selected,
      input: AgentInput<Selected>,
      options?: RunStartOptions,
    ) => Effect.Effect<HostRun<AgentOutput<Selected>>, StartError | SessionError | AgentNotRegistered>
    readonly list: (sessionId: string) => Effect.Effect<ReadonlyArray<RunInspection>, SessionError>
    readonly inspect: (runId: string) => Effect.Effect<RunInspection, InspectError>
    readonly cancel: (runId: string, reason?: string) => Effect.Effect<void, CancelError>
  }
  readonly events: {
    readonly subscribe: (sessionId: string, cursor?: Cursor) => Stream.Stream<HostEvent, SessionEventsError>
  }
}

type AgentDefinition<Value> =
  Value extends Agent<
    infer Tools,
    infer Requirements,
    infer PolicyServices,
    infer AuthorizationServices,
    infer Input,
    infer Output
  >
    ? Agent<Tools, Requirements, PolicyServices, AuthorizationServices, Input, Output>
    : never

type AgentServices<Value> =
  Value extends Agent<
    infer Tools,
    infer Requirements,
    infer _PolicyServices,
    infer _AuthorizationServices,
    infer Input,
    infer Output
  >
    ? ClosedServices<Tools, Requirements, Input, Output>
    : never

type PluginTool<Plugins> =
  Plugins extends ReadonlyArray<infer Entry> ? (Entry extends Plugin<infer Tools> ? Tools[number] : never) : never

type PluginToolsByName<Plugins> = {
  readonly [Current in PluginTool<Plugins> as Current["name"]]: Current
}

type PluginServices<Plugins> =
  | Tool.HandlersFor<PluginToolsByName<Plugins>>
  | Exclude<Tool.HandlerServices<PluginTool<Plugins>>, ToolContext>

export type CreateRequirements<
  Agents extends ReadonlyArray<AnyAgent>,
  Plugins extends ReadonlyArray<Plugin<ReadonlyArray<Tool.Any>>>,
> =
  | Runtime
  | LanguageModel.LanguageModel
  | Approvals
  | Permissions
  | AgentServices<Agents[number]>
  | PluginServices<Plugins>

export type CreateError = DuplicateAgent | PluginNameConflict | PluginToolConflict

const plugin = <const Tools extends ReadonlyArray<Tool.Any> = ReadonlyArray<never>>(
  options: PluginOptions<Tools>,
): Plugin<Tools> => options

const configuredAgent = <Value extends AnyAgent>(agent: Value, tools: ReadonlyArray<Tool.Any>): Value => {
  const hidden: unknown = agent
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: Agent.Any hides only invariant type parameters; it is produced by Agent.make.
  const definition = hidden as AgentDefinition<Value>
  const configured: unknown = withTools(definition, tools)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: withTools preserves Value's input, output, services, policy, and identity phantom.
  return configured as Value
}

const registerAgent = <Value extends AnyAgent>(runtime: Runtime["Service"], agent: Value) => {
  const hidden: unknown = agent
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: Value is an Agent whose hidden invariant parameters are recovered by this distributive conditional type.
  const definition = hidden as AgentDefinition<Value>
  return runtime.register(definition)
}

const startAgent = <Value extends AnyAgent>(
  runtime: Runtime["Service"],
  agent: Value,
  input: AgentInput<Value>,
  options: StartOptions,
): Effect.Effect<RunHandle<AgentOutput<Value>>, StartError> =>
  Effect.suspend(() => {
    const hidden: unknown = agent
    // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: Value is an Agent whose hidden input and output codecs are recovered by this distributive conditional type.
    const definition = hidden as AgentDefinition<Value>
    const started = runtime.start(definition, input, options)
    // SAFETY: Runtime decodes completion through the unchanged output codec carried by Value.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return started as Effect.Effect<RunHandle<AgentOutput<Value>>, StartError>
  })

const hostRun = <Output>(handle: RunHandle<Output>): HostRun<Output> => ({
  id: handle.runId,
  await: handle.await,
  events: handle.events,
  steer: handle.steer,
  followUp: handle.followUp,
})

const staticSkillCatalog = (skills: ReadonlyArray<Skill>): SkillCatalogService => {
  const all = [...skills]
  const byName = new Map(all.map((skill) => [skill.name, skill]))
  return SkillCatalog.of({
    all: Effect.succeed(all),
    get: (name) => Effect.succeed(byName.get(name)),
  })
}

const toolName = (tool: Tool.Any): string => tool.name

interface PluginContributions {
  readonly tools: ReadonlyArray<Tool.Any>
  readonly instructions: ReadonlyArray<InstructionProvider>
  readonly skills: ReadonlyArray<Skill>
}

const preparePlugins = (
  plugins: ReadonlyArray<Plugin<ReadonlyArray<Tool.Any>>>,
  agents: ReadonlyArray<AnyAgent>,
): Effect.Effect<PluginContributions, PluginNameConflict | PluginToolConflict> =>
  Effect.gen(function* () {
    const pluginNames = new Set<string>()
    const pluginTools = new Map<string, { readonly plugin: string; readonly tool: Tool.Any }>()
    const instructions: Array<InstructionProvider> = []
    const skills: Array<Skill> = []
    for (const current of plugins) {
      if (pluginNames.has(current.name)) {
        return yield* PluginNameConflict.make({
          name: current.name,
          hint: "Give each host plugin a unique name.",
        })
      }
      pluginNames.add(current.name)
      for (const tool of current.tools ?? []) {
        const name = toolName(tool)
        const existing = pluginTools.get(name)
        if (existing !== undefined) {
          return yield* PluginToolConflict.make({
            name,
            sources: [existing.plugin, current.name],
            hint: "Rename or remove one of the colliding plugin tools.",
          })
        }
        pluginTools.set(name, { plugin: current.name, tool })
      }
      instructions.push(...(current.instructions ?? []))
      skills.push(...(current.skills ?? []))
    }

    const tools = [...pluginTools.values()].map(({ tool }) => tool)
    for (const agent of agents) {
      for (const tool of tools) {
        const name = toolName(tool)
        if (!Object.hasOwn(agent.toolkit.tools, name)) continue
        return yield* PluginToolConflict.make({
          name,
          sources: [`agent:${agent.name}`, `plugin:${pluginTools.get(name)!.plugin}`],
          hint: "Rename or remove the plugin tool that collides with the Agent's static toolkit.",
        })
      }
    }

    for (const [index, current] of plugins.entries()) {
      yield* Effect.logInfo("Loaded Generalist host plugin").pipe(
        Effect.annotateLogs({
          "generalist.host.plugin.name": current.name,
          "generalist.host.plugin.index": index,
          "generalist.host.plugin.count": plugins.length,
        }),
      )
    }
    return { tools, instructions, skills }
  })

const mergedInstructions = (
  current: Option.Option<InstructionsService>,
  contributed: ReadonlyArray<InstructionProvider>,
): InstructionsService | undefined => {
  if (contributed.length === 0) return Option.getOrUndefined(current)
  return Instructions.of({
    providers: [...(Option.isSome(current) ? current.value.providers : []), ...contributed],
  })
}

const mergedSkills = (
  current: Option.Option<SkillCatalogService>,
  contributed: ReadonlyArray<Skill>,
): SkillCatalogService | undefined => {
  const existing = Option.getOrUndefined(current)
  if (contributed.length === 0) return existing
  const additions = staticSkillCatalog(contributed)
  return Option.isSome(current) ? mergeSkillCatalogs(current.value, additions) : additions
}

const projectedEvent = (sessionId: string, entry: HostSessionEvent): Option.Option<HostEvent> => {
  const base = { sessionId, cursor: entry.cursor, runId: entry.event.runId }
  switch (entry.event._tag) {
    case "RunAccepted":
      return Option.some({ ...base, _tag: "RunStarted", event: entry.event })
    case "TurnStarted":
    case "TurnCompleted":
      return Option.some({ ...base, _tag: "Turn", event: entry.event })
    case "ToolExecutionStarted":
    case "ToolProgress":
    case "ToolExecutionCompleted":
    case "ToolExecutionWaiting":
      return Option.some({ ...base, _tag: "ToolCall", event: entry.event })
    case "ApprovalRequested":
      return Option.some({ ...base, _tag: "ApprovalRequested", event: entry.event })
    case "CompactionApplied":
      return Option.some({ ...base, _tag: "Compacted", event: entry.event })
    case "RunCompleted":
    case "RunFailed":
    case "RunCancelled":
      return Option.some({ ...base, _tag: "Completed", event: entry.event })
    default:
      return Option.none()
  }
}

const create = <
  const Agents extends ReadonlyArray<AnyAgent>,
  const Plugins extends ReadonlyArray<Plugin<ReadonlyArray<Tool.Any>>> = ReadonlyArray<never>,
>(
  options: CreateOptions<Agents, Plugins>,
): Effect.Effect<Host<Agents>, CreateError, CreateRequirements<Agents, Plugins>> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime
    yield* LanguageModel.LanguageModel
    yield* Approvals
    yield* Permissions

    const plugins: ReadonlyArray<Plugin<ReadonlyArray<Tool.Any>>> = options.plugins ?? []
    const currentInstructions = yield* Effect.serviceOption(Instructions)
    const currentSkills = yield* Effect.serviceOption(SkillCatalog)
    const contributions = yield* preparePlugins(plugins, options.agents)
    const instructions = mergedInstructions(currentInstructions, contributions.instructions)
    const skills = mergedSkills(currentSkills, contributions.skills)

    const registered = new Map<AnyAgent, AnyAgent>()
    for (const agent of options.agents) {
      const configured = configuredAgent(agent, contributions.tools)
      let registration = registerAgent(runtime, configured)
      if (instructions !== undefined) {
        registration = registration.pipe(Effect.provideService(Instructions, instructions))
      }
      if (skills !== undefined) registration = registration.pipe(Effect.provideService(SkillCatalog, skills))
      yield* registration
      registered.set(agent, configured)
    }

    const host: Host<Agents> = {
      sessions: {
        create: (sessionOptions = {}) =>
          Effect.gen(function* () {
            const request: Types.Mutable<{ readonly id: string; readonly title?: string }> = {
              id: sessionOptions.id ?? `session_${yield* generateId}`,
            }
            if (sessionOptions.title !== undefined) request.title = sessionOptions.title
            return yield* runtime.createSession(request)
          }),
        get: runtime.session,
        list: () => runtime.listSessions,
      },
      runs: {
        start: (sessionId, agent, input, startOptions) =>
          Effect.gen(function* () {
            yield* runtime.session(sessionId)
            const configured = registered.get(agent)
            if (configured === undefined) {
              return yield* AgentNotRegistered.make({
                name: agent.name,
                hint: "Pass an Agent from the agents array supplied to Generalist.create.",
              })
            }
            const runtimeOptions: Types.Mutable<StartOptions> = { sessionId }
            if (startOptions?.idempotencyKey !== undefined) {
              runtimeOptions.idempotencyKey = startOptions.idempotencyKey
            }
            // SAFETY: the lookup is keyed by an Agent from Agents and stores its same-typed configured clone.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            return hostRun(yield* startAgent(runtime, configured as typeof agent, input, runtimeOptions))
          }),
        list: runtime.sessionRuns,
        inspect: runtime.inspect,
        cancel: (runId, reason) => {
          const input: Types.Mutable<{ readonly runId: string; readonly reason?: string }> = { runId }
          if (reason !== undefined) input.reason = reason
          return runtime.cancel(input)
        },
      },
      events: {
        subscribe: (sessionId, cursor) => {
          const input: Types.Mutable<{ readonly sessionId: string; readonly cursor?: Cursor }> = { sessionId }
          if (cursor !== undefined) input.cursor = cursor
          return runtime
            .sessionEvents(input)
            .pipe(Stream.filterMap(Filter.fromPredicateOption((entry) => projectedEvent(sessionId, entry))))
        },
      },
    }
    return host
  })

/** Stable process-local product host. */
export const Generalist = { create, plugin } as const
