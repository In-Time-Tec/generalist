import { Context, Effect, Layer, Option, Schema, SchemaIssue } from "effect"
import { Tool } from "effect/unstable/ai"
import type { Agent, ClosedServices } from "../../core/agent/service.js"
import { ToolContext } from "../../core/tools/tool-context.js"
import {
  type CancellationRequest,
  FrameworkFailure,
  type Outcome,
  type Request,
  type Service as ToolExecutorService,
  ToolExecutor,
  executeToolkit,
  route as toolExecutorRoute,
} from "../../core/tools/tool-executor.js"
import type { Route } from "../../core/tools/tool-placement.js"
import type { Service as RunStoreService } from "../run/store.js"
import { make as makeAddress } from "../address.js"
import { make as makeMessage } from "../messaging/message.js"
import { normalizePrompt } from "../memory/prompt.js"
import { childRunIdFor, fanOutIdFor } from "./fan-out-internal.js"
import { fanOutMemberSessionId } from "./session.js"
import {
  AwaitGroupParameters,
  Failure,
  GroupReceipt,
  Parameters,
  StartGroupParameters,
  awaitGroupToolName,
  resultFromInspection,
  runGroupToolName,
  startGroupToolName,
  toolName,
} from "./group.js"
import { ChildDepthExceeded, ChildLimitExceeded } from "../errors.js"
import { supportsCancellation } from "../../core/tools/tool-executor-cancellation.js"

export * from "./group.js"

/** @experimental Input for one blocking child invocation. */
export type Input = typeof Parameters.Type & {
  readonly parentRunId: string
  readonly toolCallId: string
  readonly operationKey?: string
}

/** @experimental Input for one non-blocking bounded child-group admission. */
export type StartGroupInput = StartGroupParameters & {
  readonly parentRunId: string
  readonly toolCallId: string
  readonly operationKey?: string
}

/** @experimental Input for one durable child-group join. */
export type AwaitGroupInput = AwaitGroupParameters & {
  readonly parentRunId: string
  readonly toolCallId: string
}

type MutableInput = { -readonly [Key in keyof Input]: Input[Key] }
type MutableGroupInput = { -readonly [Key in keyof StartGroupInput]: StartGroupInput[Key] }

/** @experimental Runtime-owned child execution operations used by the model-facing routes. */
export interface Service {
  readonly invoke: (input: Input) => Effect.Effect<Outcome>
  readonly runGroup: (input: StartGroupInput) => Effect.Effect<Outcome>
  readonly startGroup: (input: StartGroupInput) => Effect.Effect<Outcome>
  readonly awaitGroup: (input: AwaitGroupInput) => Effect.Effect<Outcome>
}

/** @experimental Runtime-owned child execution service. */
export class ChildRuns extends Context.Service<ChildRuns, Service>()("generalist/runtime/child/runs/ChildRuns") {}

const success = <Result>(result: Result): Outcome => ({ _tag: "Success", result, encodedResult: result })

const ErrorMessage = Schema.Struct({ message: Schema.String })

const domainFailure = <Error>(error: Error): Outcome => {
  const decoded = Schema.decodeUnknownOption(ErrorMessage)(error)
  const failure =
    Schema.is(ChildDepthExceeded)(error) || Schema.is(ChildLimitExceeded)(error)
      ? error
      : {
          message: decoded._tag === "Some" ? decoded.value.message : String(error),
        }
  return { _tag: "DomainFailure", failure, encodedFailure: Schema.encodeSync(Failure)(failure) }
}

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

/** @experimental Construct Runtime-owned child execution operations over one RunStore. */
export const make = (store: RunStoreService): Service => {
  interface Origin {
    parentToolCallId: string
    operationKey?: string
  }
  interface ChildMetadata extends Record<string, unknown> {
    runtimeChildTool: true
    parentRunId: string
    parentToolCallId: string
    childLabel?: string
  }
  interface GroupMetadata extends Record<string, unknown> {
    runtimeChildGroup: true
    parentRunId: string
    parentToolCallId: string
    childGroupId: string
    childGroupKey: string
    childGroupLabel?: string
  }
  type Mutable<Value> = Value extends Value ? { -readonly [Key in keyof Value]: Value[Key] } : never
  type MutableResult = Mutable<typeof import("./group.js").Result.Type>
  type MutableReceiptChild = {
    -readonly [Key in keyof GroupReceipt["children"][number]]: GroupReceipt["children"][number][Key]
  }
  const invoke: Service["invoke"] = (input) =>
    Effect.gen(function* () {
      const idempotencyKey = `child-tool:${input.parentRunId}:${input.toolCallId}`
      const origin: Origin = { parentToolCallId: input.toolCallId }
      if (input.operationKey !== undefined) origin.operationKey = input.operationKey
      const metadata: ChildMetadata = {
        runtimeChildTool: true,
        parentRunId: input.parentRunId,
        parentToolCallId: input.toolCallId,
      }
      if (input.label !== undefined) metadata.childLabel = input.label
      const admission = {
        parentRunId: input.parentRunId,
        invocationId: input.toolCallId,
        selection: input.selection,
        origin,
        prompt: input.prompt,
        message: makeMessage({
          id: `spawn:${idempotencyKey}`,
          to: makeAddress(`spawn:${input.parentRunId}`),
          sessionId: `child:${input.parentRunId}`,
          prompt: normalizePrompt(input.prompt),
          idempotencyKey,
          correlationId: input.parentRunId,
          metadata,
        }),
      }
      const admissionWithLabel: typeof admission & { label?: string } = admission
      if (input.label !== undefined) admissionWithLabel.label = input.label
      const receipt = yield* store.admitSpawn(admissionWithLabel)
      const snapshot = yield* store.snapshot(receipt.runId)
      if (snapshot.outcome?._tag === "Succeeded") {
        const result: MutableResult =
          "text" in snapshot.outcome.result
            ? {
                _tag: "Succeeded",
                childRunId: receipt.runId,
                text: snapshot.outcome.result.text,
                turns: snapshot.outcome.result.turns,
              }
            : { _tag: "Failed", childRunId: receipt.runId, message: "non-Agent child executable" }
        if (input.label !== undefined) result.label = input.label
        return success(result)
      }
      if (snapshot.outcome?._tag === "Failed") {
        const result: MutableResult = {
          _tag: "Failed",
          childRunId: receipt.runId,
          message: snapshot.outcome.error.message,
        }
        if (input.label !== undefined) result.label = input.label
        return success(result)
      }
      if (snapshot.outcome?._tag === "Cancelled") {
        const result: MutableResult = { _tag: "Cancelled", childRunId: receipt.runId }
        if (input.label !== undefined) result.label = input.label
        if (snapshot.outcome.reason !== undefined) result.reason = snapshot.outcome.reason
        return success(result)
      }
      return { _tag: "Suspend" as const, token: receipt.runId }
    }).pipe(Effect.catch((error) => Effect.succeed(domainFailure(error))))

  const admitGroup = (input: StartGroupInput) =>
    Effect.gen(function* () {
      const idempotencyKey = `child-group:${input.parentRunId}:${input.toolCallId}`
      const groupId = fanOutIdFor(input.parentRunId, idempotencyKey)
      const receipt = yield* store.admitFanOut({
        fanOutId: groupId,
        parentRunId: input.parentRunId,
        idempotencyKey,
        ...Object.assign(
          {},
          input.concurrency === undefined
            ? undefined
            : { concurrency: Math.min(input.concurrency, input.members.length) },
        ),
        join: { _tag: "AllSettled" },
        remainder: "await",
        members: input.members.map((member, ordinal) => {
          const metadata: GroupMetadata = {
            runtimeChildGroup: true,
            parentRunId: input.parentRunId,
            parentToolCallId: input.toolCallId,
            childGroupId: groupId,
            childGroupKey: member.key,
          }
          if (member.label !== undefined) metadata.childGroupLabel = member.label
          const origin: Origin = { parentToolCallId: input.toolCallId }
          if (input.operationKey !== undefined) origin.operationKey = input.operationKey
          const admitted = {
            ordinal,
            key: member.key,
            childRunId: childRunIdFor(groupId, ordinal),
            selection: member.selection,
            prompt: normalizePrompt(member.prompt),
            sessionId: fanOutMemberSessionId({ fanOutId: groupId, key: member.key }),
            metadata,
            origin,
          }
          const admittedWithLabel: typeof admitted & { label?: string } = admitted
          if (member.label !== undefined) admittedWithLabel.label = member.label
          return admittedWithLabel
        }),
      })
      const inspection = yield* store.inspectFanOut(receipt.fanOutId)
      const result: GroupReceipt = {
        groupId: receipt.fanOutId,
        children: inspection.members.map((member) => {
          const child: MutableReceiptChild = {
            key: member.key,
            selection: member.selection,
            childRunId: member.childRunId,
            depth: member.depth,
            readiness: member.readiness,
          }
          if (member.label !== undefined) child.label = member.label
          return child
        }),
      }
      return { receipt: result, inspection }
    })

  const startGroup: Service["startGroup"] = (input) =>
    admitGroup(input).pipe(
      Effect.map(({ receipt }) => success(receipt)),
      Effect.catch((error) => Effect.succeed(domainFailure(error))),
    )

  const runGroup: Service["runGroup"] = (input) =>
    admitGroup(input).pipe(
      Effect.map(({ receipt, inspection }) =>
        inspection.status === "running"
          ? ({ _tag: "Suspend", token: receipt.groupId } as const)
          : success(resultFromInspection(inspection)),
      ),
      Effect.catch((error) => Effect.succeed(domainFailure(error))),
    )

  const awaitGroup: Service["awaitGroup"] = (input) =>
    store.inspectFanOut(input.groupId).pipe(
      Effect.map((inspection) => {
        if (inspection.parentRunId !== input.parentRunId) {
          return domainFailure(
            new Error(`child group ${input.groupId} is not owned by parent Run ${input.parentRunId}`),
          )
        }
        return inspection.status === "running"
          ? ({ _tag: "Suspend", token: input.groupId } as const)
          : success(resultFromInspection(inspection))
      }),
      Effect.catch((error) => Effect.succeed(domainFailure(error))),
    )

  return ChildRuns.of({ invoke, runGroup, startGroup, awaitGroup })
}

/** @experimental Route Runtime-owned child tools and preserve every resolved upstream handler. */
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
  const upstreamCancellation =
    upstream?.cancel !== undefined
      ? {
          cancellable: (request: Request) => !route.matches(request) && supportsCancellation(upstream, request),
          cancel: (request: CancellationRequest) => upstream.cancel!(request),
        }
      : {}
  return ToolExecutor.of({
    replayPolicy: (request) => {
      if (route.matches(request)) return "never"
      return Option.isSome(options.upstream) ? (options.upstream.value.replayPolicy?.(request) ?? "never") : "never"
    },
    execute: (request) => {
      if (route.matches(request)) {
        return route.execute(request).pipe(Effect.provideService(ChildRuns, options.implementation))
      }
      if (Option.isSome(options.upstream)) return options.upstream.value.execute(request)
      return Effect.flatMap(Effect.context<ToolContext>(), (context) =>
        Effect.scoped(
          Effect.flatMap(Layer.build(options.environment), (environment) =>
            executeToolkit(options.agent.toolkit, request).pipe(
              Effect.provideContext(context),
              Effect.provideContext(environment),
            ),
          ),
        ),
      )
    },
    ...upstreamCancellation,
  })
}

/** @experimental Tool executor that owns Runtime child routes. */
export const Executor = { make: makeExecutor }

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

/** @experimental Route for the blocking and grouped child tools. */
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
        const childInput: MutableInput = {
          ...input,
          parentRunId: runId,
          toolCallId,
        }
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
        const groupInput: MutableGroupInput = {
          ...input,
          parentRunId: runId,
          toolCallId,
        }
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
