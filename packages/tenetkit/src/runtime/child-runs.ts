import { Context, Effect, Layer, Option, Schema, SchemaIssue } from "effect"
import { Tool } from "effect/unstable/ai"
import { Agent, ToolContext, ToolExecutor } from "tenetkit"
import type { Interface as RunStoreInterface } from "./run-store.js"
import { make as makeAddress } from "./address.js"
import { make as makeMessage } from "./message.js"
import { normalizePrompt } from "./memory/prompt.js"
import { childRunIdFor, fanOutIdFor } from "./fan-out.js"
import { fanOutMemberSessionId } from "./child-session.js"
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
} from "./child-group.js"
import { ChildDepthExceeded, ChildLimitExceeded } from "./errors.js"

export * from "./child-group.js"

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

/** @experimental Runtime-owned child execution operations used by the model-facing routes. */
export interface Interface {
  readonly invoke: (input: Input) => Effect.Effect<ToolExecutor.Outcome>
  readonly runGroup: (input: StartGroupInput) => Effect.Effect<ToolExecutor.Outcome>
  readonly startGroup: (input: StartGroupInput) => Effect.Effect<ToolExecutor.Outcome>
  readonly awaitGroup: (input: AwaitGroupInput) => Effect.Effect<ToolExecutor.Outcome>
}

/** @experimental Runtime-owned child execution service. */
export class ChildRuns extends Context.Service<ChildRuns, Interface>()("tenetkit/runtime/child-runs/ChildRuns") {}

const success = (result: unknown): ToolExecutor.Outcome => ({ _tag: "Success", result, encodedResult: result })

const domainFailure = (error: unknown): ToolExecutor.Outcome => {
  const failure =
    Schema.is(ChildDepthExceeded)(error) || Schema.is(ChildLimitExceeded)(error)
      ? error
      : {
          message:
            typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error),
        }
  return { _tag: "DomainFailure", failure, encodedFailure: Schema.encodeSync(Failure)(failure) }
}

const schemaIssueFormatter = SchemaIssue.makeFormatterStandardSchemaV1()

const formatIssuePath = (path: ReadonlyArray<PropertyKey>): string =>
  path
    .map((segment, index) => {
      if (typeof segment === "number") return `[${segment}]`
      if (typeof segment === "string" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
        return index === 0 ? segment : `.${segment}`
      }
      return `[${typeof segment === "string" ? JSON.stringify(segment) : String(segment)}]`
    })
    .join("")

const schemaIssueMessage = (error: Schema.SchemaError): string =>
  schemaIssueFormatter(error.issue)
    .issues.map((issue) => {
      const path = issue.path as ReadonlyArray<PropertyKey> | undefined
      return path === undefined || path.length === 0 ? issue.message : `${issue.message}\n  at ${formatIssuePath(path)}`
    })
    .join("\n")

/** @experimental Construct Runtime-owned child execution operations over one RunStore. */
export const make = (store: RunStoreInterface): Interface => {
  const invoke: Interface["invoke"] = (input) =>
    Effect.gen(function* () {
      const idempotencyKey = `child-tool:${input.parentRunId}:${input.toolCallId}`
      const receipt = yield* store.admitSpawn({
        parentRunId: input.parentRunId,
        invocationId: input.toolCallId,
        selection: input.selection,
        ...(input.label === undefined ? {} : { label: input.label }),
        origin: {
          parentToolCallId: input.toolCallId,
          ...(input.operationKey === undefined ? {} : { operationKey: input.operationKey }),
        },
        prompt: input.prompt,
        message: makeMessage({
          id: `spawn:${idempotencyKey}`,
          to: makeAddress(`spawn:${input.parentRunId}`),
          sessionId: `child:${input.parentRunId}`,
          prompt: normalizePrompt(input.prompt),
          idempotencyKey,
          correlationId: input.parentRunId,
          metadata: {
            runtimeChildTool: true,
            parentRunId: input.parentRunId,
            parentToolCallId: input.toolCallId,
            ...(input.label === undefined ? {} : { childLabel: input.label }),
          },
        }),
      })
      const snapshot = yield* store.snapshot(receipt.runId)
      if (snapshot.outcome?._tag === "Succeeded") {
        const result =
          "text" in snapshot.outcome.result
            ? {
                _tag: "Succeeded" as const,
                childRunId: receipt.runId,
                ...(input.label === undefined ? {} : { label: input.label }),
                text: snapshot.outcome.result.text,
                turns: snapshot.outcome.result.turns,
              }
            : {
                _tag: "Failed" as const,
                childRunId: receipt.runId,
                ...(input.label === undefined ? {} : { label: input.label }),
                message: "non-Agent child executable",
              }
        return success(result)
      }
      if (snapshot.outcome?._tag === "Failed") {
        return success({
          _tag: "Failed" as const,
          childRunId: receipt.runId,
          ...(input.label === undefined ? {} : { label: input.label }),
          message: snapshot.outcome.error.message,
        })
      }
      if (snapshot.outcome?._tag === "Cancelled") {
        return success({
          _tag: "Cancelled" as const,
          childRunId: receipt.runId,
          ...(input.label === undefined ? {} : { label: input.label }),
          ...(snapshot.outcome.reason === undefined ? {} : { reason: snapshot.outcome.reason }),
        })
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
        ...(input.concurrency === undefined ? {} : { concurrency: Math.min(input.concurrency, input.members.length) }),
        join: { _tag: "AllSettled" },
        remainder: "await",
        members: input.members.map((member, ordinal) => ({
          ordinal,
          key: member.key,
          ...(member.label === undefined ? {} : { label: member.label }),
          childRunId: childRunIdFor(groupId, ordinal),
          selection: member.selection,
          prompt: normalizePrompt(member.prompt),
          sessionId: fanOutMemberSessionId({ fanOutId: groupId, key: member.key }),
          metadata: {
            runtimeChildGroup: true,
            parentRunId: input.parentRunId,
            parentToolCallId: input.toolCallId,
            childGroupId: groupId,
            childGroupKey: member.key,
            ...(member.label === undefined ? {} : { childGroupLabel: member.label }),
          },
          origin: {
            parentToolCallId: input.toolCallId,
            ...(input.operationKey === undefined ? {} : { operationKey: input.operationKey }),
          },
        })),
      })
      const inspection = yield* store.inspectFanOut(receipt.fanOutId)
      const result: GroupReceipt = {
        groupId: receipt.fanOutId,
        children: inspection.members.map((member) => ({
          key: member.key,
          selection: member.selection,
          ...(member.label === undefined ? {} : { label: member.label }),
          childRunId: member.childRunId,
          depth: member.depth,
          readiness: member.readiness,
        })),
      }
      return { receipt: result, inspection }
    })

  const startGroup: Interface["startGroup"] = (input) =>
    admitGroup(input).pipe(
      Effect.map(({ receipt }) => success(receipt)),
      Effect.catch((error) => Effect.succeed(domainFailure(error))),
    )

  const runGroup: Interface["runGroup"] = (input) =>
    admitGroup(input).pipe(
      Effect.map(({ receipt, inspection }) =>
        inspection.status === "running"
          ? ({ _tag: "Suspend", token: receipt.groupId } as const)
          : success(resultFromInspection(inspection)),
      ),
      Effect.catch((error) => Effect.succeed(domainFailure(error))),
    )

  const awaitGroup: Interface["awaitGroup"] = (input) =>
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
export const makeExecutor = <Tools extends Record<string, Tool.Any>, R>(options: {
  readonly agent: Agent.Agent<Tools, R>
  readonly environment: Layer.Layer<Agent.ClosedServices<Tools, R>>
  readonly implementation: Interface
  readonly upstream: Option.Option<ToolExecutor.Interface>
}): ToolExecutor.Interface =>
  ToolExecutor.ToolExecutor.of({
    execute: (request) =>
      route.matches(request)
        ? route.execute(request).pipe(Effect.provideService(ChildRuns, options.implementation))
        : Option.isSome(options.upstream)
          ? options.upstream.value.execute(request)
          : Effect.flatMap(Effect.context<ToolContext.ToolContext>(), (context) =>
              Effect.scoped(
                Effect.flatMap(Layer.build(options.environment), (environment) =>
                  ToolExecutor.executeToolkit(options.agent.toolkit, request).pipe(
                    Effect.provideContext(context),
                    Effect.provideContext(environment),
                  ),
                ),
              ),
            ),
  })

const runtimeContext = Effect.gen(function* () {
  const context = yield* ToolContext.ToolContext
  const children = yield* ChildRuns
  if (context.runId === undefined || context.toolCallId === undefined) {
    return yield* ToolExecutor.FrameworkFailure.make({
      stage: "handler",
      tool: "child-runs",
      message: "child tools require a Runtime-owned ToolContext",
    })
  }
  return { context, children }
})

/** @experimental Route for the blocking and grouped child tools. */
export const route: ToolExecutor.Route<ChildRuns | ToolContext.ToolContext> = ToolExecutor.route({
  tools: [toolName, runGroupToolName, startGroupToolName, awaitGroupToolName],
  execute: (request) =>
    Effect.gen(function* () {
      const { context, children } = yield* runtimeContext
      if (request.call.name === toolName) {
        const input = yield* Schema.decodeUnknownEffect(Parameters)(request.call.params).pipe(
          Effect.mapError(() =>
            ToolExecutor.FrameworkFailure.make({
              stage: "decode-input",
              tool: toolName,
              message: "run_child requires one declared selection and a non-empty prompt",
            }),
          ),
        )
        return yield* children.invoke({
          ...input,
          parentRunId: context.runId!,
          toolCallId: context.toolCallId!,
          ...(context.operationKey === undefined ? {} : { operationKey: context.operationKey }),
        })
      }
      if (request.call.name === runGroupToolName || request.call.name === startGroupToolName) {
        const input = yield* Schema.decodeUnknownEffect(StartGroupParameters)(request.call.params).pipe(
          Effect.mapError((error) =>
            ToolExecutor.FrameworkFailure.make({
              stage: "decode-input",
              tool: request.call.name,
              message: schemaIssueMessage(error),
            }),
          ),
        )
        const groupInput = {
          ...input,
          parentRunId: context.runId!,
          toolCallId: context.toolCallId!,
          ...(context.operationKey === undefined ? {} : { operationKey: context.operationKey }),
        }
        return yield* request.call.name === runGroupToolName
          ? children.runGroup(groupInput)
          : children.startGroup(groupInput)
      }
      const input = yield* Schema.decodeUnknownEffect(AwaitGroupParameters)(request.call.params).pipe(
        Effect.mapError(() =>
          ToolExecutor.FrameworkFailure.make({
            stage: "decode-input",
            tool: awaitGroupToolName,
            message: "await_child_group requires a durable groupId",
          }),
        ),
      )
      return yield* children.awaitGroup({ ...input, parentRunId: context.runId!, toolCallId: context.toolCallId! })
    }),
})
