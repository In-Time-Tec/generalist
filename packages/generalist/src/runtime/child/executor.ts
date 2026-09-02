import { Context, Effect, Exit, Layer, Option, Result, Schema, SchemaIssue } from "effect"
import { Prompt, Tool } from "effect/unstable/ai"
import { AgentError, ChildExceedsParent } from "../../core/agent/event.js"
import type { Agent, ClosedServices } from "../../core/agent/service.js"
import { RunError } from "../../core/agent/run/error.js"
import {
  definition as agentFanOutDefinition,
  type Definition as AgentFanOutDefinition,
  validateAuthority,
  withoutFanOut,
} from "../../core/agent/tool/fan-out.js"
import { Exhausted } from "../../core/durable/run-budget.js"
import { inheritedHistory, inheritance, type InheritanceOptions } from "../../core/agent/lifecycle/fan-out.js"
import { DriverError, DriverStateInvalid } from "../../core/durable/service.js"
import { supportsCancellation } from "../../core/tools/tool-executor-cancellation.js"
import { ToolContext } from "../../core/tools/tool-context.js"
import {
  type CancellationRequest,
  type DomainFailure,
  FrameworkFailure,
  type Outcome,
  type Request,
  type Service as ToolExecutorService,
  type SettledOutcome,
  ToolExecutor,
  executeToolkit,
  route as toolExecutorRoute,
} from "../../core/tools/tool-executor.js"
import type { Route } from "../../core/tools/tool-placement.js"
import { HookFailed } from "../../hooks/index.js"
import { ChildDepthExceeded, ChildLimitExceeded } from "../errors.js"
import type { FanOutJoin, FanOutRemainder } from "./fan-out.js"
import {
  AwaitGroupParameters,
  Failure,
  GroupResult,
  Parameters,
  StartGroupParameters,
  awaitGroupToolName,
  runGroupToolName,
  startGroupToolName,
  toolName,
  type GroupResult as GroupResultType,
} from "./group.js"
import { ChildLifecycle, type ChildHookError } from "./lifecycle.js"

/** Input for one blocking child invocation. */
export type Input = typeof Parameters.Type & {
  readonly parentRunId: string
  readonly toolCallId: string
  readonly operationKey?: string
}

/** Input for one non-blocking bounded child-group admission. */
export type StartGroupInput = StartGroupParameters & {
  readonly parentRunId: string
  readonly toolCallId: string
  readonly operationKey?: string
}

/** Input for one durable child-group join. */
export type AwaitGroupInput = AwaitGroupParameters & {
  readonly parentRunId: string
  readonly toolCallId: string
}

/** Internal typed child-group admission used by AgentTool.fanOut. */
export interface FanOutGroupInput {
  readonly parentRunId: string
  readonly toolCallId: string
  readonly operationKey?: string
  readonly tasks?: Request["tasks"]
  readonly members: ReadonlyArray<{
    readonly key: string
    readonly selection: string
    readonly label?: string
    readonly prompt: Prompt.RawInput
    readonly inherit?: InheritanceOptions
    readonly history?: Prompt.Prompt
  }>
  readonly concurrency?: number
  readonly budgetDivisor?: number
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
}

/** Runtime-owned child execution operations used by the model-facing routes. */
export interface Service {
  readonly invoke: (input: Input) => Effect.Effect<Outcome, ChildHookError>
  readonly runGroup: (input: StartGroupInput) => Effect.Effect<Outcome, ChildHookError>
  readonly startGroup: (input: StartGroupInput) => Effect.Effect<Outcome, ChildHookError>
  readonly awaitGroup: (input: AwaitGroupInput) => Effect.Effect<Outcome, ChildHookError>
  readonly fanOut: (input: FanOutGroupInput) => Effect.Effect<Outcome, ChildHookError>
  readonly transformResolved?:
    | ((request: Request, outcome: SettledOutcome) => Effect.Effect<SettledOutcome, ChildHookError>)
    | undefined
}

/** Runtime-owned child execution service. */
// oxlint-disable-next-line effecttsgo/deterministic-keys -- preserve the public service key after moving its implementation from runs.ts.
export class ChildRuns extends Context.Service<ChildRuns, Service>()("generalist/runtime/child/runs/ChildRuns") {}

/** @internal Construct a successful tool outcome. */
export const success = <Result>(result: Result): Outcome => ({ _tag: "Success", result, encodedResult: result })

const ErrorMessage = Schema.Struct({ message: Schema.String })

const domainFailure = <Error>(error: Error): DomainFailure => {
  if (Schema.is(Exhausted)(error)) {
    return { _tag: "DomainFailure", failure: error, encodedFailure: Schema.encodeSync(Exhausted)(error) }
  }
  if (Schema.is(ChildExceedsParent)(error)) {
    const failure = { message: error.message, failure: error }
    return { _tag: "DomainFailure", failure: error, encodedFailure: Schema.encodeSync(Failure)(failure) }
  }
  const decoded = Schema.decodeUnknownOption(ErrorMessage)(error)
  const failure =
    Schema.is(ChildDepthExceeded)(error) || Schema.is(ChildLimitExceeded)(error)
      ? error
      : { message: decoded._tag === "Some" ? decoded.value.message : String(error) }
  return { _tag: "DomainFailure", failure, encodedFailure: Schema.encodeSync(Failure)(failure) }
}

/** @internal Preserve framework failures while encoding model-facing child policy failures. */
export const catchDomainFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A | DomainFailure, ChildHookError, R> =>
  effect.pipe(
    Effect.catch((error): Effect.Effect<DomainFailure, ChildHookError> => {
      if (Schema.is(HookFailed)(error)) return Effect.fail(error)
      if (Schema.is(DriverError)(error)) return Effect.fail(error)
      if (Schema.is(DriverStateInvalid)(error)) return Effect.fail(error)
      return Effect.succeed(domainFailure(error))
    }),
  )

const FanOutFailure = Schema.Struct({ message: Schema.String, failure: Schema.optionalKey(RunError) })

const failedExit = (member: GroupResultType["children"][number]) => {
  const decoded = Schema.decodeUnknownOption(FanOutFailure)(member.error)
  if (decoded._tag === "Some" && decoded.value.failure !== undefined) return Exit.fail(decoded.value.failure)
  const message =
    member.message ??
    (member.status === "cancelled" || member.status === "abandoned"
      ? (member.reason ?? `Child ${member.childRunId} was ${member.status}`)
      : `Child ${member.childRunId} completed without an output`)
  return Exit.fail(AgentError.make({ message, turn: 0 }))
}

const collectExits = (group: GroupResultType) =>
  group.children.map((member) =>
    member.status === "succeeded" && "output" in member ? Exit.succeed(member.output) : failedExit(member),
  )

function completeAgentFanOut(
  request: Request,
  definition: AgentFanOutDefinition,
  onFailure: "collect" | "failFast",
  outcome: SettledOutcome,
  context: Context.Context<unknown>,
): Effect.Effect<SettledOutcome, FrameworkFailure>
function completeAgentFanOut(
  request: Request,
  definition: AgentFanOutDefinition,
  onFailure: "collect" | "failFast",
  outcome: Outcome,
  context: Context.Context<unknown>,
): Effect.Effect<Outcome, FrameworkFailure>
function completeAgentFanOut(
  request: Request,
  definition: AgentFanOutDefinition,
  onFailure: "collect" | "failFast",
  outcome: Outcome,
  context: Context.Context<unknown>,
): Effect.Effect<Outcome, FrameworkFailure> {
  if (outcome._tag !== "Success") return Effect.succeed(outcome)
  return Schema.decodeUnknownEffect(GroupResult)(outcome.result).pipe(
    Effect.mapError((error) =>
      FrameworkFailure.make({
        stage: "handler",
        tool: request.call.name,
        message: `Durable fan-out returned an invalid child-group result: ${error.message}`,
      }),
    ),
    Effect.flatMap((group) => {
      if (onFailure === "failFast" && group.status !== "succeeded") {
        const failed = group.children.find((member) => member.status === "failed")
        return Effect.fail(
          FrameworkFailure.make({
            stage: "handler",
            tool: request.call.name,
            message: failed?.message ?? "A fail-fast child run did not succeed",
          }),
        )
      }
      const exits = collectExits(group)
      return definition.encode(exits, context).pipe(
        Effect.map((encodedResult): Outcome => ({ _tag: "Success", result: exits, encodedResult })),
        Effect.mapError((error) =>
          FrameworkFailure.make({ stage: "encode-success", tool: request.call.name, message: error.message }),
        ),
      )
    }),
  )
}

/** Route Runtime-owned child tools and preserve every resolved upstream handler. */
const makeExecutor = <
  Tools extends Record<string, Tool.Any>,
  R,
  InputSchema extends Schema.Top,
  OutputSchema extends Schema.Top,
>(options: {
  readonly agent: Agent<Tools, R, R, R, InputSchema, OutputSchema>
  readonly environment: Layer.Layer<ClosedServices<Tools, R, InputSchema, OutputSchema>>
  readonly implementation: Service
  readonly upstream: Option.Option<ToolExecutorService>
}): ToolExecutorService => {
  const upstream = Option.getOrUndefined(options.upstream)
  const fanOutFor = (request: Request) => {
    const tool = options.agent.toolkit.tools[request.call.name]
    return tool === undefined ? undefined : agentFanOutDefinition(tool)
  }
  const decodeFanOut = (request: Request, definition: AgentFanOutDefinition, context: Context.Context<unknown>) =>
    definition
      .decode(request.call.params, context)
      .pipe(
        Effect.mapError((error) =>
          FrameworkFailure.make({ stage: "decode-input", tool: request.call.name, message: error.message }),
        ),
      )
  const executeFanOut = (request: Request, definition: AgentFanOutDefinition) =>
    Effect.gen(function* () {
      const context = yield* ToolContext
      if (context.runId === undefined || context.toolCallId === undefined) {
        return yield* FrameworkFailure.make({
          stage: "handler",
          tool: request.call.name,
          message: "AgentTool.fanOut requires a Runtime-owned ToolContext",
        })
      }
      const environment = yield* Layer.build(options.environment)
      const parameters = yield* decodeFanOut(request, definition, environment)
      const authority = yield* Effect.result(
        validateAuthority(
          options.agent,
          definition,
          parameters.children.map((member) => member.agent),
        ),
      )
      if (Result.isFailure(authority)) return domainFailure(authority.failure)
      const members: Array<FanOutGroupInput["members"][number]> = []
      const parentHistory = context.history === undefined ? undefined : yield* context.history
      for (const [index, member] of parameters.children.entries()) {
        const prompt = yield* definition
          .encodeInput(member.agent, member.input, environment)
          .pipe(
            Effect.mapError((error) =>
              FrameworkFailure.make({ stage: "decode-input", tool: request.call.name, message: error.message }),
            ),
          )
        const inherit = inheritance(member.inherit)
        const history = inheritedHistory(inherit.history, parentHistory)
        members.push({
          key: String(index),
          selection: member.agent,
          prompt,
          inherit,
          ...Object.assign({}, history === undefined ? undefined : { history }),
        })
      }
      const failFast = (parameters.onFailure ?? "collect") === "failFast"
      const input: FanOutGroupInput = {
        parentRunId: context.runId,
        toolCallId: context.toolCallId,
        members,
        concurrency: Math.min(parameters.concurrency ?? members.length, members.length),
        budgetDivisor: definition.maxChildren,
        join: failFast ? { _tag: "AllSuccess" } : { _tag: "AllSettled" },
        remainder: failFast ? "request-cancel" : "await",
        ...Object.assign({}, request.tasks === undefined ? undefined : { tasks: request.tasks }),
        ...Object.assign({}, context.operationKey === undefined ? undefined : { operationKey: context.operationKey }),
      }
      const outcome = yield* options.implementation.fanOut(input)
      return yield* completeAgentFanOut(request, definition, parameters.onFailure ?? "collect", outcome, environment)
    })
  const transformFanOut = (
    request: Request,
    definition: AgentFanOutDefinition,
    outcome: Extract<SettledOutcome, { readonly _tag: "Success" }>,
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* ToolContext
        const environment = yield* Layer.build(options.environment)
        const parameters = yield* decodeFanOut(request, definition, environment)
        const group = yield* Schema.decodeUnknownEffect(GroupResult)(outcome.result).pipe(
          Effect.mapError((error) =>
            FrameworkFailure.make({ stage: "handler", tool: request.call.name, message: error.message }),
          ),
        )
        const transformed = yield* catchDomainFailure(
          ChildLifecycle.endGroup(context.runId ?? "runtime", group).pipe(
            Effect.map((result): SettledOutcome => ({ _tag: "Success", result, encodedResult: result })),
          ),
        )
        return yield* completeAgentFanOut(
          request,
          definition,
          parameters.onFailure ?? "collect",
          transformed,
          environment,
        )
      }),
    )
  const upstreamCancellation =
    upstream?.cancel !== undefined
      ? {
          cancellable: (request: Request) => !route.matches(request) && supportsCancellation(upstream, request),
          cancel: (request: CancellationRequest) => upstream.cancel!(request),
        }
      : {}
  return ToolExecutor.of({
    replayPolicy: (request) => {
      if (route.matches(request) || fanOutFor(request) !== undefined) return "never"
      return Option.isSome(options.upstream) ? (options.upstream.value.replayPolicy?.(request) ?? "never") : "never"
    },
    execute: (request) => {
      const fanOut = fanOutFor(request)
      if (fanOut !== undefined) return Effect.scoped(executeFanOut(request, fanOut))
      if (route.matches(request))
        return route.execute(request).pipe(Effect.provideService(ChildRuns, options.implementation))
      if (Option.isSome(options.upstream)) return options.upstream.value.execute(request)
      return Effect.flatMap(Effect.context<ToolContext>(), (context) =>
        Effect.scoped(
          Effect.flatMap(Layer.build(options.environment), (environment) =>
            executeToolkit(withoutFanOut(options.agent.toolkit), request).pipe(
              Effect.provideContext(context),
              Effect.provideContext(environment),
            ),
          ),
        ),
      )
    },
    transformResolved: (request, outcome) => {
      const fanOut = fanOutFor(request)
      if (fanOut !== undefined && outcome._tag === "Success") return transformFanOut(request, fanOut, outcome)
      if (route.matches(request)) {
        return options.implementation.transformResolved === undefined
          ? Effect.succeed(outcome)
          : options.implementation.transformResolved(request, outcome)
      }
      return upstream?.transformResolved === undefined
        ? Effect.succeed(outcome)
        : upstream.transformResolved(request, outcome)
    },
    ...upstreamCancellation,
  })
}

/** Tool executor that owns Runtime child routes. */
export const Executor = { make: makeExecutor }

const schemaIssueFormatter = SchemaIssue.makeFormatterStandardSchemaV1()
const formatIssuePath = <Segment>(path: ReadonlyArray<Segment>): string =>
  path
    .map((segment, index) => {
      if (Schema.is(Schema.Finite)(segment)) return `[${segment}]`
      if (Schema.is(Schema.String)(segment) && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
        return index === 0 ? segment : `.${segment}`
      }
      return `[${Schema.is(Schema.String)(segment) ? JSON.stringify(segment) : String(segment)}]`
    })
    .join("")
const schemaIssueMessage = (error: Schema.SchemaError): string =>
  schemaIssueFormatter(error.issue)
    .issues.map((issue) => {
      const path = issue.path
      return path === undefined || path.length === 0 ? issue.message : `${issue.message}\n  at ${formatIssuePath(path)}`
    })
    .join("\n")

type MutableInput = { -readonly [Key in keyof Input]: Input[Key] }
type MutableGroupInput = { -readonly [Key in keyof StartGroupInput]: StartGroupInput[Key] }

const runtimeContext = Effect.gen(function* () {
  const context = yield* ToolContext
  const children = yield* ChildRuns
  if (context.runId === undefined || context.toolCallId === undefined) {
    return yield* FrameworkFailure.make({
      stage: "handler",
      tool: "child-runs",
      message: "child tools require a Runtime-owned ToolContext",
    })
  }
  return { context, children, runId: context.runId, toolCallId: context.toolCallId }
})

/** Route for the blocking and grouped child tools. */
export const route: Route<ChildRuns | ToolContext> = toolExecutorRoute({
  tools: [toolName, runGroupToolName, startGroupToolName, awaitGroupToolName],
  execute: (request) =>
    Effect.gen(function* () {
      const { context, children, runId, toolCallId } = yield* runtimeContext
      if (request.call.name === toolName) {
        const input = yield* Schema.decodeUnknownEffect(Parameters)(request.call.params).pipe(
          Effect.mapError(() =>
            FrameworkFailure.make({
              stage: "decode-input",
              tool: toolName,
              message: "run_child requires one declared selection and a non-empty prompt",
            }),
          ),
        )
        const childInput: MutableInput = { ...input, parentRunId: runId, toolCallId }
        if (context.operationKey !== undefined) childInput.operationKey = context.operationKey
        return yield* children.invoke(childInput)
      }
      if (request.call.name === runGroupToolName || request.call.name === startGroupToolName) {
        const input = yield* Schema.decodeUnknownEffect(StartGroupParameters)(request.call.params).pipe(
          Effect.mapError((error) =>
            FrameworkFailure.make({
              stage: "decode-input",
              tool: request.call.name,
              message: schemaIssueMessage(error),
            }),
          ),
        )
        const groupInput: MutableGroupInput = { ...input, parentRunId: runId, toolCallId }
        if (context.operationKey !== undefined) groupInput.operationKey = context.operationKey
        return yield* request.call.name === runGroupToolName
          ? children.runGroup(groupInput)
          : children.startGroup(groupInput)
      }
      const input = yield* Schema.decodeUnknownEffect(AwaitGroupParameters)(request.call.params).pipe(
        Effect.mapError(() =>
          FrameworkFailure.make({
            stage: "decode-input",
            tool: awaitGroupToolName,
            message: "await_child_group requires a durable groupId",
          }),
        ),
      )
      return yield* children.awaitGroup({ ...input, parentRunId: runId, toolCallId })
    }),
})
