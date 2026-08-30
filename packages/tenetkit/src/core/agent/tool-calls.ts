import { Effect, Layer, Option, Ref, Schema, Stream } from "effect"
import { dual } from "effect/Function"
import { Chat, Prompt, Response, Tool } from "effect/unstable/ai"
import { resolve as resolveRunBudget, type BudgetLimits, type RunBudget } from "../durable/run-budget.js"
import type { DriverCheckpoint } from "../durable/driver/contract.js"
import { layerForRun } from "../durable/driver/layer-for-run.js"
import { setToolBatch } from "../durable/driver/run.js"
import { LoopDriverState } from "../durable/loop-driver-state.js"
import { DriverStateInvalid } from "../durable/service.js"
import type { ExecutableRef } from "../durable/manifest/executable-manifest.js"
import { FrameworkFailure, ToolExecutor } from "../tools/tool-executor.js"
import { get, select, type Registry } from "../tools/tool-registry.js"
import { ToolContext } from "../tools/tool-context.js"
import { InvalidToolCallParameters } from "../model/tool-call-validation.js"
import { AgentError, AgentSuspended, DuplicateToolCallId, type Event, ResumeMismatch } from "./event.js"
import type { Agent, ProgressOverflowPolicy, Resume, RunError, RunOptions } from "./service.js"
import { setupStaticTools } from "./lifecycle/construction.js"
import { validate as validateOptions } from "./lifecycle/options.js"
import { setupToolAuthorizer } from "./lifecycle/setup.js"
import { providerOutputState } from "./message.js"
import { scheduleBatch } from "./model-turn/tool-batch.js"
import { promptDigest } from "./prompt-identity.js"
import { sameSuspension, validResolutions } from "./suspension.js"
import { waits, type ToolBatchCheckpoint, type ToolBatchResolution } from "./tools/checkpoint.js"
import { make as makeToolExecution } from "./tools/execution.js"
import { resumeBatch } from "./tools/resume-batch.js"
import type { AnyToolCall, PendingToolResult } from "./tools/result.js"

/** @experimental One non-empty externally completed, authored-order framework tool-call batch. */
export type ToolCallBatch = readonly [Response.ToolCallPartEncoded, ...ReadonlyArray<Response.ToolCallPartEncoded>]

/** @experimental Host facts required before a new externally completed tool-call batch is admitted. */
export interface ToolCallBatchStart {
  readonly _tag: "Start"
  readonly calls: ToolCallBatch
  readonly activeTools: ReadonlyArray<string>
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly sessionId: string
  readonly logicalOperationId: string
  readonly turn: number
  readonly budget?: BudgetLimits
  readonly executableRef?: ExecutableRef
  readonly invocation?: RunOptions["invocation"]
}

/** @experimental Host facts required to recover or resolve one persisted tool-call batch. */
export interface ToolCallBatchResume {
  readonly _tag: "Resume"
  readonly driverCheckpoint: DriverCheckpoint
  readonly executableRef: ExecutableRef
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly resume?: Resume
  readonly invocation?: RunOptions["invocation"]
}

/** @experimental One fresh or persisted externally completed framework tool-call batch. */
export type ToolCallBatchOptions = ToolCallBatchStart | ToolCallBatchResume

type StaticToolServices<Tools extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<Tools>
  | Exclude<Tool.HandlerServices<Tools[keyof Tools]>, ToolContext>

/** @experimental Services used by externally completed framework calls; no LanguageModel call is performed. */
export type ToolCallBatchRequirements<Tools extends Record<string, Tool.Any>, AuthorizationServices> =
  | AuthorizationServices
  | StaticToolServices<Tools>

const invalid = (message: string, turn = 0): AgentError => AgentError.make({ message, turn })

const validateIdentity = (options: ToolCallBatchStart): Effect.Effect<void, AgentError> => {
  if (options.sessionId.length === 0) return invalid("Tool-call batch sessionId must be non-empty", options.turn)
  if (options.logicalOperationId.length === 0) {
    return invalid("Tool-call batch logicalOperationId must be non-empty", options.turn)
  }
  if (!Number.isSafeInteger(options.turn) || options.turn < 0) {
    return invalid("Tool-call batch turn must be a non-negative safe integer")
  }
  if (options.calls.length === 0) return invalid("Tool-call batch must contain at least one call", options.turn)
  return Effect.void
}

const validateActiveTools = (
  registry: Registry,
  activeTools: ReadonlyArray<string>,
  turn: number,
): Effect.Effect<Registry, AgentError> =>
  Effect.gen(function* () {
    const seen = new Set<string>()
    for (const name of activeTools) {
      if (seen.has(name)) return yield* invalid(`Tool-call batch activeTools contains duplicate tool: ${name}`, turn)
      const candidate = get(registry, name)
      if (candidate === undefined || candidate.dispatch !== "Static") {
        return yield* invalid(`Tool-call batch activeTools names a non-executable static tool: ${name}`, turn)
      }
      seen.add(name)
    }
    return select(registry, activeTools)
  })

const decodeMessages = (
  messages: ReadonlyArray<Prompt.Message>,
  turn: number,
): Effect.Effect<ReadonlyArray<Prompt.Message>, AgentError> =>
  Schema.decodeEffect(Schema.Array(Prompt.Message), { onExcessProperty: "error" })(messages).pipe(
    Effect.mapError((error) => invalid(`Invalid tool-call authorization messages: ${error.message}`, turn)),
  )

const decodeCalls = (
  registry: Registry,
  activeTools: ReadonlySet<string>,
  calls: ReadonlyArray<Response.ToolCallPartEncoded | ToolBatchCheckpoint["calls"][number]["call"]>,
  turn: number,
): Effect.Effect<ReadonlyArray<AnyToolCall>, RunError> =>
  Effect.gen(function* () {
    const decoded: Array<AnyToolCall> = []
    const firstIndexes = new Map<string, number>()
    for (const [index, input] of calls.entries()) {
      const named = yield* Schema.decodeEffect(Schema.Struct({ name: Schema.String }))(input).pipe(
        Effect.mapError((error) => invalid(`Invalid tool call at index ${index}: ${error.message}`, turn)),
      )
      const candidate = get(registry, named.name)
      if (candidate === undefined || candidate.dispatch !== "Static" || !activeTools.has(named.name)) {
        return yield* FrameworkFailure.make({
          stage: "authorization",
          tool: named.name,
          message: `Tool ${named.name} is not active for turn ${turn}`,
        })
      }
      const call = yield* Schema.decodeUnknownEffect(
        Response.ToolCallPart(named.name, Schema.toType(candidate.tool.parametersSchema)),
        { onExcessProperty: "error" },
      )(input).pipe(Effect.mapError(() => InvalidToolCallParameters.make({ toolName: named.name })))
      if (call.id.length === 0) return yield* invalid(`Tool call at index ${index} has an empty id`, turn)
      if (call.providerExecuted) {
        return yield* FrameworkFailure.make({
          stage: "authorization",
          tool: call.name,
          message: `Provider-executed tool call ${call.id} cannot be executed by the framework`,
        })
      }
      const firstIndex = firstIndexes.get(call.id)
      if (firstIndex !== undefined) {
        return yield* DuplicateToolCallId.make({ id: call.id, firstIndex, duplicateIndex: index })
      }
      firstIndexes.set(call.id, index)
      decoded.push(call)
    }
    return decoded
  })

const runOptionsForStart = (options: ToolCallBatchStart, messages: ReadonlyArray<Prompt.Message>): RunOptions => {
  const base: RunOptions = {
    prompt: messages,
    sessionId: options.sessionId,
    logicalOperationId: options.logicalOperationId,
    turnStart: options.turn,
  }
  const withBudget = options.budget === undefined ? base : { ...base, budget: options.budget }
  const withExecutable =
    options.executableRef === undefined ? withBudget : { ...withBudget, executableRef: options.executableRef }
  return options.invocation === undefined ? withExecutable : { ...withExecutable, invocation: options.invocation }
}

const runOptionsForResume = (
  options: ToolCallBatchResume,
  messages: ReadonlyArray<Prompt.Message>,
  state: LoopDriverState,
): RunOptions => {
  const base: RunOptions = {
    prompt: messages,
    sessionId: state.sessionId,
    logicalOperationId: state.logicalOperationId,
    turnStart: options.driverCheckpoint.turn,
    driverCheckpoint: options.driverCheckpoint,
    executableRef: options.executableRef,
  }
  return options.invocation === undefined ? base : { ...base, invocation: options.invocation }
}

const validateResume = (
  options: ToolCallBatchResume,
  batch: ToolBatchCheckpoint,
  messages: ReadonlyArray<Prompt.Message>,
): Effect.Effect<ReadonlyArray<import("./tools/checkpoint.js").ToolBatchResolution>, RunError> =>
  Effect.gen(function* () {
    if (promptDigest(messages) !== batch.authorizationContextDigest) {
      return yield* invalid("Tool-call batch authorization messages do not match the persisted checkpoint", batch.turn)
    }
    const expected = AgentSuspended.make({ checkpoint: batch, waits: waits(batch) })
    if (options.resume === undefined) return []
    if (!sameSuspension(expected, options.resume.suspension)) {
      return yield* ResumeMismatch.make({
        reason: "identity-mismatch",
        expected,
        received: options.resume.suspension,
      })
    }
    const resolutions = options.resume.resolutions ?? []
    if (!validResolutions(expected, resolutions)) {
      return yield* ResumeMismatch.make({
        reason: "identity-mismatch",
        expected,
        received: options.resume.suspension,
      })
    }
    return resolutions
  })

interface PreparedBatch {
  readonly options: RunOptions
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly turn: number
  readonly registry: Registry
  readonly calls: ReadonlyArray<AnyToolCall>
  readonly activeTools: ReadonlyArray<string>
  readonly checkpoint: ToolBatchCheckpoint | undefined
  readonly resolutions: ReadonlyArray<ToolBatchResolution>
  readonly runBudget: RunBudget | undefined
}

const prepareStart = (
  input: ToolCallBatchStart,
  staticRegistry: Registry,
  agentBudget: BudgetLimits | undefined,
): Effect.Effect<PreparedBatch, RunError> =>
  Effect.gen(function* () {
    yield* validateIdentity(input)
    const messages = yield* decodeMessages(input.messages, input.turn)
    const registry = yield* validateActiveTools(staticRegistry, input.activeTools, input.turn)
    const calls = yield* decodeCalls(staticRegistry, new Set(input.activeTools), input.calls, input.turn)
    return {
      options: runOptionsForStart(input, messages),
      messages,
      turn: input.turn,
      registry,
      calls,
      activeTools: input.activeTools,
      checkpoint: undefined,
      resolutions: [],
      runBudget: resolveRunBudget(agentBudget, input.budget),
    }
  })

const prepareResume = (input: ToolCallBatchResume, staticRegistry: Registry): Effect.Effect<PreparedBatch, RunError> =>
  Effect.gen(function* () {
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(input.driverCheckpoint.state).pipe(
      Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
    )
    const turn = state.toolBatch?.turn ?? input.driverCheckpoint.turn
    const messages = yield* decodeMessages(input.messages, turn)
    const checkpoint = state.toolBatch
    if (checkpoint === undefined) {
      return yield* invalid("Persisted driver checkpoint has no active tool-call batch", turn)
    }
    const registry = yield* validateActiveTools(staticRegistry, checkpoint.activeTools, turn)
    const calls = yield* decodeCalls(
      staticRegistry,
      new Set(checkpoint.activeTools),
      checkpoint.calls.map((entry) => entry.call),
      turn,
    )
    const resolutions = yield* validateResume(input, checkpoint, messages)
    return {
      options: runOptionsForResume(input, messages, state),
      messages,
      turn,
      registry,
      calls,
      activeTools: checkpoint.activeTools,
      checkpoint,
      resolutions,
      runBudget: undefined,
    }
  })

const prepareInput = (
  input: ToolCallBatchOptions,
  staticRegistry: Registry,
  agentBudget: BudgetLimits | undefined,
): Effect.Effect<PreparedBatch, RunError> =>
  input._tag === "Start" ? prepareStart(input, staticRegistry, agentBudget) : prepareResume(input, staticRegistry)

const streamToolCallsImpl = <Tools extends Record<string, Tool.Any>, R, P, A>(
  agent: Agent<Tools, R, P, A>,
  input: ToolCallBatchOptions,
): Stream.Stream<Event, RunError, ToolCallBatchRequirements<Tools, A>> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const { staticRegistry, staticToolkit } = yield* setupStaticTools(agent)
      const { options, messages, turn, registry, calls, activeTools, checkpoint, resolutions, runBudget } =
        yield* prepareInput(input, staticRegistry, agent.budget)
      const progressPolicy: ProgressOverflowPolicy = yield* validateOptions(options, agent)
      const authorizer = yield* setupToolAuthorizer(agent)
      const executor = yield* Effect.serviceOption(ToolExecutor)
      const chat = yield* Chat.fromPrompt(messages)
      const toolState = yield* Ref.make({ registry, activatedSkillBodies: new Map<string, string>() })
      const state = {
        text: "",
        turn,
        pending: new Map<number, PendingToolResult>(),
        finish: undefined,
        usage: undefined,
        currentContext: undefined,
        currentContextTokens: undefined,
        reportedContextUsage: undefined,
        providerOutput: providerOutputState(),
      }
      const toolRuntime = makeToolExecution({
        options,
        state,
        isSkillActivationCall: () => false,
        agent,
        staticToolkit,
        chat,
        activeSession: Option.none(),
        sessionId: options.sessionId ?? agent.name,
        executor,
        authorizer,
        skillRuntime: undefined,
        toolState,
        progressPolicy,
        skillError: (errorTurn, error) => AgentError.make({ message: error.message, turn: errorTurn, cause: error }),
      })
      const interpreter = yield* Layer.build(layerForRun(agent, options, Prompt.make(messages), runBudget))
      const withInterpreter = <Value, E, R2>(stream: Stream.Stream<Value, E, R2>) =>
        stream.pipe(Stream.provideContext(interpreter))
      const executionStream =
        checkpoint === undefined
          ? scheduleBatch({
              turn,
              calls,
              executions: calls.map((call, toolCallIndex) => ({ call, messages, toolCallIndex })),
              toolScheduling: agent.toolScheduling,
              activeTools,
              authorizationMessages: messages,
              pending: state.pending,
              execute: ({ call, messages: authorizationMessages, toolCallIndex }) =>
                toolRuntime.toolCallEvents(turn, { calls }, toolCallIndex, call, authorizationMessages, registry),
            })
          : resumeBatch({
              checkpoint,
              messages,
              resolutions,
              registry,
              toolScheduling: agent.toolScheduling,
              emitCompleted: true,
              toolCallEvents: toolRuntime.toolCallEvents,
              resumeApproved: toolRuntime.resumeApproved,
              onCheckpoint: () => Effect.void,
            })
      return withInterpreter(
        executionStream.pipe(Stream.concat(Stream.fromEffect(setToolBatch(undefined)).pipe(Stream.drain))),
      )
    }),
  )

/** @experimental Execute one externally completed tool-call batch without invoking a LanguageModel. */
export const streamToolCalls: {
  (
    options: ToolCallBatchOptions,
  ): <Tools extends Record<string, Tool.Any>, R, P, A>(
    agent: Agent<Tools, R, P, A>,
  ) => Stream.Stream<Event, RunError, ToolCallBatchRequirements<Tools, A>>
  <Tools extends Record<string, Tool.Any>, R, P, A>(
    agent: Agent<Tools, R, P, A>,
    options: ToolCallBatchOptions,
  ): Stream.Stream<Event, RunError, ToolCallBatchRequirements<Tools, A>>
} = dual(2, streamToolCallsImpl)
