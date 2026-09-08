/* oxlint-disable effecttsgo/any-unknown-in-error-context, typescript/no-unsafe-return -- Agent.Any intentionally hides invariant Agent parameters at the heterogeneous Host registry boundary; the distributive AgentDefinition/AgentServices types restore each configured Agent's exact contract. */
import { Clock, Effect, Filter, Option, Ref, Result, Schema, Stream, Types } from "effect"
import { LanguageModel, Tool } from "effect/unstable/ai"
import type { BudgetLimits } from "../core/durable/run-budget.js"
import {
  Hooks,
  make as makeHooks,
  type Declaration as HookDeclaration,
  type Service as HooksService,
} from "../hooks/index.js"
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
import type { CreateSessionError, HostSession, SessionError, SessionEventsError } from "../runtime/session/host.js"
import type { RunInspection } from "../runtime/run.js"
import type { ForkOptions, RewindOptions } from "../runtime/fork.js"
import type { Decision as ApprovalDecision } from "../runtime/operation/approval.js"
import type { Explanation, UnknownResolution } from "../runtime/execution/recovery/operator.js"
import {
  Runtime,
  type CancelError,
  type ForkError,
  type InspectError,
  type OperatorActionError,
  type OperatorExtendBudgetError,
  type RewindError,
  type RespondApprovalError,
  type RunHandle,
  type RunSend,
  type RuntimeInspection,
  type StartError,
  type StartOptions,
} from "../runtime/service.js"
import { DuplicateAgent, IllegalOperatorAction, type RuntimeUnavailable } from "../runtime/errors.js"
import { resolveApproval } from "./approval.js"
import { make as preparePlugins, type Plugin } from "./plugins.js"
import { project, type HostEvent } from "./event.js"
import type { PreviewDelivery } from "./preview.js"
import { AgentInputInvalid, AgentNotRegistered, PluginNameConflict, PluginToolConflict } from "./errors.js"
import { type Attachments, make as makeAttachments } from "./attachments.js"
import { BlobStore } from "../blob-store/index.js"
import { ArtifactRegistry } from "../core/artifact.js"
import { make as makeSessionHandle, type SessionHandle, type SessionCreateOptions } from "./session.js"
import { childSessionId } from "../runtime/child/session.js"
export type {
  SessionHandle,
  SessionCreateOptions,
  QueueCommandOptions,
  QueueEditOptions,
  QueueError,
} from "./session.js"
import { type Artifacts, make as makeArtifacts } from "./artifacts.js"
const rejectedPreview: Result.Result<PreviewDelivery, void> = Result.failVoid
export type { HostSession } from "../runtime/session/host.js"
export { AgentInputInvalid, AgentNotRegistered, PluginNameConflict, PluginToolConflict } from "./errors.js"
export {
  HostEvent,
  TasksUpdated,
  ArtifactUpdated,
  type ApprovalRequested,
  type Compacted,
  type Completed,
  type RunStarted,
  type ToolCall,
  type Turn,
} from "./event.js"
export { PreviewDelivery } from "./preview.js"
export {
  SessionNotFound,
  SessionConflict,
  SessionCursorExpired,
  SessionSubscriberLagged,
} from "../runtime/session/host.js"
export type { Plugin } from "./plugins.js"
export interface PluginOptions<Tools extends ReadonlyArray<Tool.Any> = ReadonlyArray<never>> {
  readonly name: string
  readonly tools?: Tools
  readonly instructions?: ReadonlyArray<InstructionProvider>
  readonly skills?: ReadonlyArray<Skill>
  readonly hooks?: ReadonlyArray<HookDeclaration>
}
export interface CreateOptions<
  Agents extends ReadonlyArray<AnyAgent>,
  Plugins extends ReadonlyArray<Plugin<ReadonlyArray<Tool.Any>>> = ReadonlyArray<never>,
> {
  readonly agents: Agents
  readonly plugins?: Plugins
}
export type RunStartOptions = Pick<StartOptions, "idempotencyKey">
export type EncodedAgentInput = Schema.Json
export interface ChildSpawnOptions {
  readonly commandId: string
  readonly label?: string
}
export interface ChildHandle {
  readonly session: SessionHandle
  readonly run: HostRun<unknown>
}
export type HostRun<Output> = Omit<RunHandle<Output>, "runId"> & {
  readonly id: RunHandle<Output>["runId"]
  readonly spawn: (
    selection: string,
    prompt: import("effect/unstable/ai/Prompt").Prompt | string,
    options: ChildSpawnOptions,
  ) => Effect.Effect<ChildHandle, import("../runtime/service.js").SpawnError | InspectError | SessionError>
}
export interface Host<Agents extends ReadonlyArray<AnyAgent>> {
  readonly attachments: Attachments
  readonly artifacts: Artifacts
  readonly sessions: {
    readonly create: (
      options?: SessionCreateOptions,
    ) => Effect.Effect<
      SessionHandle,
      CreateSessionError | AgentNotRegistered | import("../runtime/errors.js").UnknownAgent
    >
    readonly get: (sessionId: string) => Effect.Effect<SessionHandle, SessionError>
    readonly snapshot: (
      sessionId: string,
    ) => Effect.Effect<
      import("../runtime/session/host.js").HostSessionSnapshot,
      import("../runtime/session/host.js").SessionSnapshotError
    >
    readonly list: () => Effect.Effect<
      ReadonlyArray<HostSession>,
      RuntimeUnavailable | import("../durability/errors.js").DurabilityFailure
    >
    readonly fork: (runId: string, options: ForkOptions) => Effect.Effect<HostRun<unknown>, ForkError>
  }
  readonly runs: {
    readonly get: (runId: string) => Effect.Effect<HostRun<unknown>, InspectError>
    readonly start: <Selected extends Agents[number]>(
      sessionId: string,
      agent: Selected,
      input: AgentInput<Selected>,
      options?: RunStartOptions,
    ) => Effect.Effect<HostRun<AgentOutput<Selected>>, StartError | SessionError | AgentNotRegistered>
    readonly startByName: (
      sessionId: string,
      agent: string,
      input: EncodedAgentInput,
      options?: RunStartOptions,
    ) => Effect.Effect<HostRun<unknown>, StartError | SessionError | AgentNotRegistered | AgentInputInvalid>
    readonly list: (sessionId: string) => Effect.Effect<ReadonlyArray<RunInspection>, SessionError>
    readonly inspect: (runId: string) => Effect.Effect<RuntimeInspection, InspectError>
    readonly send: RunSend
    readonly cancel: (runId: string, commandId: string, reason?: string) => Effect.Effect<void, CancelError>
    readonly rewind: (runId: string, options: RewindOptions) => Effect.Effect<void, RewindError>
  }
  readonly events: {
    readonly subscribe: (
      sessionId: string,
      cursor?: Cursor,
    ) => Effect.Effect<Stream.Stream<HostEvent, SessionEventsError>, SessionError>
    readonly previews: (sessionId: string, runId: string) => Effect.Effect<Stream.Stream<PreviewDelivery>, SessionError>
  }
  readonly approvals: {
    readonly resolve: (
      runId: string,
      token: string,
      decision: ApprovalDecision,
      operator: string,
    ) => Effect.Effect<void, InspectError | RespondApprovalError | IllegalOperatorAction>
  }
  readonly operator: {
    readonly explain: (runId: string) => Effect.Effect<Explanation, InspectError>
    readonly retry: (runId: string, operator: string, commandId: string) => Effect.Effect<void, OperatorActionError>
    readonly wake: (runId: string, operator: string, commandId: string) => Effect.Effect<void, OperatorActionError>
    readonly resolveUnknown: (
      runId: string,
      operationId: string,
      resolution: UnknownResolution,
      operator: string,
      commandId: string,
    ) => Effect.Effect<void, OperatorActionError>
    readonly extendBudget: (
      runId: string,
      delta: BudgetLimits,
      operator: string,
      commandId: string,
    ) => Effect.Effect<void, OperatorExtendBudgetError>
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

const staticSkillCatalog = (skills: ReadonlyArray<Skill>): SkillCatalogService => {
  const all = [...skills]
  const byName = new Map(all.map((skill) => [skill.name, skill]))
  return SkillCatalog.of({
    all: Effect.succeed(all),
    get: (name) => Effect.succeed(byName.get(name)),
  })
}

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

const mergedHooks = (
  current: Option.Option<HooksService>,
  contributed: ReadonlyArray<HookDeclaration>,
): HooksService | undefined => {
  const existing = Option.getOrUndefined(current)
  if (contributed.length === 0) return existing
  return makeHooks({ declarations: [...(existing?.declarations ?? []), ...contributed] })
}

const create = <
  const Agents extends ReadonlyArray<AnyAgent>,
  const Plugins extends ReadonlyArray<Plugin<ReadonlyArray<Tool.Any>>> = ReadonlyArray<never>,
>(
  options: CreateOptions<Agents, Plugins>,
): Effect.Effect<Host<Agents>, CreateError, CreateRequirements<Agents, Plugins>> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime
    const environment = yield* Effect.context<CreateRequirements<Agents, Plugins>>()
    yield* LanguageModel.LanguageModel
    yield* Approvals
    yield* Permissions

    const plugins: ReadonlyArray<Plugin<ReadonlyArray<Tool.Any>>> = options.plugins ?? []
    const currentInstructions = yield* Effect.serviceOption(Instructions)
    const currentSkills = yield* Effect.serviceOption(SkillCatalog)
    const currentHooks = yield* Effect.serviceOption(Hooks)
    const attachments = makeAttachments(yield* Effect.serviceOption(BlobStore))
    const artifacts = makeArtifacts(yield* Effect.serviceOption(ArtifactRegistry))
    const contributions = yield* preparePlugins({ plugins, agents: options.agents })
    const instructions = mergedInstructions(currentInstructions, contributions.instructions)
    const skills = mergedSkills(currentSkills, contributions.skills)
    const hooks = mergedHooks(currentHooks, contributions.hooks)

    const registered = new Map<AnyAgent, AnyAgent>()
    const registeredByName = new Map<string, AnyAgent>()
    for (const agent of options.agents) {
      const configured = configuredAgent(agent, contributions.tools)
      let registration = registerAgent(runtime, configured)
      if (instructions !== undefined) {
        registration = registration.pipe(Effect.provideService(Instructions, instructions))
      }
      if (skills !== undefined) registration = registration.pipe(Effect.provideService(SkillCatalog, skills))
      if (hooks !== undefined) registration = registration.pipe(Effect.provideService(Hooks, hooks))
      yield* registration
      registered.set(agent, configured)
      registeredByName.set(agent.name, configured)
    }

    const sessionHandle = makeSessionHandle({ runtime, registeredByName })
    const hostRun = <Output>(handle: RunHandle<Output>): HostRun<Output> => ({
      id: handle.runId,
      await: handle.await,
      events: handle.events,
      send: handle.send,
      spawn: (selection, prompt, spawnOptions) =>
        Effect.gen(function* () {
          const receipt = yield* runtime.spawn({
            parentRunId: handle.runId,
            invocationId: spawnOptions.commandId,
            selection,
            prompt,
            ...(spawnOptions.label === undefined ? {} : { label: spawnOptions.label }),
          })
          const session = sessionHandle(
            yield* runtime.session(childSessionId({ parentRunId: handle.runId, invocationId: spawnOptions.commandId })),
          )
          return { session, run: hostRun(yield* runtime.getRun(receipt.runId)) }
        }),
    })
    const host: Host<Agents> = {
      attachments,
      artifacts,
      sessions: {
        create: (sessionOptions = {}) =>
          Effect.gen(function* () {
            const request: Types.Mutable<import("../runtime/session/host.js").CreateSessionInput> = {
              id: sessionOptions.id ?? `session_${yield* generateId}`,
            }
            if (sessionOptions.title !== undefined) request.title = sessionOptions.title
            if (sessionOptions.agent !== undefined) {
              if (!registeredByName.has(sessionOptions.agent))
                return yield* AgentNotRegistered.make({ name: sessionOptions.agent })
              request.selection = yield* runtime.sessionSelection(sessionOptions.agent)
            }
            return sessionHandle(yield* runtime.createSession(request))
          }),
        get: (sessionId) => runtime.session(sessionId).pipe(Effect.map(sessionHandle)),
        snapshot: runtime.sessionSnapshot,
        list: () => runtime.listSessions,
        fork: (runId, forkOptions) => runtime.fork(runId, forkOptions).pipe(Effect.map(hostRun)),
      },
      runs: {
        get: (runId) => runtime.getRun(runId).pipe(Effect.map(hostRun)),
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
        startByName: (sessionId, agentName, input, startOptions) =>
          Effect.gen(function* () {
            yield* runtime.session(sessionId)
            const configured = registeredByName.get(agentName)
            if (configured === undefined) {
              return yield* AgentNotRegistered.make({
                name: agentName,
                hint: "Use an Agent name from the agents array supplied to Generalist.create.",
              })
            }
            const decodeWithHostEnvironment = Schema.decodeEffect(configured.input)(input).pipe(
              Effect.provide(environment),
            )
            // SAFETY: Generalist.create captured every decoding service declared by each configured Agent input.
            // oxlint-disable-next-line effecttsgo/unsafe-effect-type-assertion, typescript/no-unsafe-type-assertion -- The heterogeneous name registry erases the configured Agent input context, which Generalist.create captures and provides here.
            const decode = decodeWithHostEnvironment as Effect.Effect<unknown, Schema.SchemaError>
            const decoded = yield* decode.pipe(
              Effect.mapError((error) => AgentInputInvalid.make({ name: agentName, message: error.message })),
            )
            const runtimeOptions: Types.Mutable<StartOptions> = { sessionId }
            if (startOptions?.idempotencyKey !== undefined) runtimeOptions.idempotencyKey = startOptions.idempotencyKey
            return hostRun(yield* startAgent(runtime, configured, decoded, runtimeOptions))
          }),
        list: runtime.sessionRuns,
        inspect: runtime.inspect,
        send: (runId, prompt, sendOptions) => runtime.send(runId, prompt, sendOptions),
        cancel: (runId, commandId, reason) => {
          const input: Types.Mutable<{ readonly runId: string; readonly commandId: string; readonly reason?: string }> =
            {
              runId,
              commandId,
            }
          if (reason !== undefined) input.reason = reason
          return runtime.cancel(input)
        },
        rewind: runtime.rewind,
      },
      events: {
        subscribe: (sessionId, cursor) => {
          const input: Types.Mutable<{ readonly sessionId: string; readonly cursor?: Cursor }> = { sessionId }
          if (cursor !== undefined) input.cursor = cursor
          return runtime
            .session(sessionId)
            .pipe(
              Effect.as(
                runtime
                  .sessionEvents(input)
                  .pipe(Stream.filterMap(Filter.fromPredicateOption((entry) => project(sessionId, entry)))),
              ),
            )
        },
        previews: (sessionId, runId) =>
          runtime.sessionRuns(sessionId).pipe(
            Effect.map((runs) => {
              if (!runs.some((run) => run.runId === runId)) return Stream.fromIterable<PreviewDelivery>([])
              return Stream.unwrap(
                Effect.gen(function* () {
                  const initialFence = yield* runtime.previewAuthority(runId)
                  const initialCheckedAt = yield* Clock.currentTimeMillis
                  const authority = yield* Ref.make({
                    fence: initialFence,
                    checkedAt: initialFence === undefined ? Number.NEGATIVE_INFINITY : initialCheckedAt,
                  })
                  return runtime.previews({ runId }).pipe(
                    Stream.filterMapEffect((event) =>
                      Effect.gen(function* () {
                        const now = yield* Clock.currentTimeMillis
                        let current = yield* Ref.get(authority)
                        if (now - current.checkedAt >= 50) {
                          current = { fence: yield* runtime.previewAuthority(runId), checkedAt: now }
                          yield* Ref.set(authority, current)
                        }
                        return current.fence === event.attemptFence
                          ? Result.succeed<PreviewDelivery>({
                              _tag: "PreviewDelivery",
                              sessionId,
                              runId,
                              authorityAttemptFence: current.fence,
                              event,
                            })
                          : rejectedPreview
                      }),
                    ),
                  )
                }),
              )
            }),
          ),
      },
      approvals: {
        resolve: (runId, token, decision, operator) => resolveApproval(runtime, runId, token, decision, operator),
      },
      operator: {
        explain: runtime.operator.explain,
        retry: runtime.operator.retry,
        wake: runtime.operator.wake,
        resolveUnknown: runtime.operator.resolveUnknown,
        extendBudget: runtime.operator.extendBudget,
      },
    }
    return host
  })
/** Stable process-local product host. */
export const Generalist = { create, plugin } as const
