import { Context, Effect, Schema } from "effect"
import { ToolContext, ToolExecutor } from "@batonfx/core"
import type { Interface as RunStoreInterface } from "./run-store.js"
import { make as makeAddress } from "./address.js"
import { make as makeMessage } from "./message.js"
import { normalizePrompt } from "./memory/prompt.js"
import { childRunIdFor, fanOutIdFor } from "./fan-out.js"
import { fanOutMemberSessionId } from "./child-session.js"
import {
  AwaitGroupParameters,
  GroupReceipt,
  Parameters,
  StartGroupParameters,
  awaitGroupToolName,
  resultFromInspection,
  startGroupToolName,
  toolName,
} from "./child-group.js"

export * from "./child-group.js"

/** @experimental Input for one blocking child invocation. */
export type Input = typeof Parameters.Type & {
  readonly parentRunId: string
  readonly toolCallId: string
}

/** @experimental Input for one non-blocking bounded child-group admission. */
export type StartGroupInput = StartGroupParameters & {
  readonly parentRunId: string
  readonly toolCallId: string
}

/** @experimental Input for one durable child-group join. */
export type AwaitGroupInput = AwaitGroupParameters & {
  readonly parentRunId: string
  readonly toolCallId: string
}

/** @experimental Runtime-owned child execution operations used by the model-facing routes. */
export interface Interface {
  readonly invoke: (input: Input) => Effect.Effect<ToolExecutor.Outcome>
  readonly startGroup: (input: StartGroupInput) => Effect.Effect<ToolExecutor.Outcome>
  readonly awaitGroup: (input: AwaitGroupInput) => Effect.Effect<ToolExecutor.Outcome>
}

/** @experimental Runtime-owned child execution service. */
export class ChildRuns extends Context.Service<ChildRuns, Interface>()("@batonfx/runtime/ChildRuns") {}

const success = (result: unknown): ToolExecutor.Outcome => ({ _tag: "Success", result, encodedResult: result })

const domainFailure = (error: unknown): ToolExecutor.Outcome => {
  const failure = {
    message: typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error),
  }
  return { _tag: "DomainFailure", failure, encodedFailure: failure }
}

/** @experimental Construct Runtime-owned child execution operations over one RunStore. */
export const make = (store: RunStoreInterface): Interface => {
  const invoke: Interface["invoke"] = (input) =>
    Effect.gen(function* () {
      const idempotencyKey = `child-tool:${input.parentRunId}:${input.toolCallId}`
      const receipt = yield* store.admitSpawn({
        parentRunId: input.parentRunId,
        invocationId: input.toolCallId,
        selection: input.selection,
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
                text: snapshot.outcome.result.text,
                turns: snapshot.outcome.result.turns,
              }
            : { _tag: "Failed" as const, childRunId: receipt.runId, message: "non-Agent child executable" }
        return success(result)
      }
      if (snapshot.outcome?._tag === "Failed") {
        return success({
          _tag: "Failed" as const,
          childRunId: receipt.runId,
          message: snapshot.outcome.error.message,
        })
      }
      if (snapshot.outcome?._tag === "Cancelled") {
        return success({
          _tag: "Cancelled" as const,
          childRunId: receipt.runId,
          ...(snapshot.outcome.reason === undefined ? {} : { reason: snapshot.outcome.reason }),
        })
      }
      return { _tag: "Suspend" as const, token: receipt.runId }
    }).pipe(Effect.catch((error) => Effect.succeed(domainFailure(error))))

  const startGroup: Interface["startGroup"] = (input) =>
    Effect.gen(function* () {
      const idempotencyKey = `child-group:${input.parentRunId}:${input.toolCallId}`
      const groupId = fanOutIdFor(input.parentRunId, idempotencyKey)
      const receipt = yield* store.admitFanOut({
        fanOutId: groupId,
        parentRunId: input.parentRunId,
        idempotencyKey,
        concurrency: Math.min(input.concurrency, input.members.length),
        join: { _tag: "AllSettled" },
        remainder: "await",
        members: input.members.map((member, ordinal) => ({
          ordinal,
          key: member.key,
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
          },
        })),
      })
      const result: GroupReceipt = {
        groupId: receipt.fanOutId,
        children: input.members.map((member, ordinal) => ({
          key: member.key,
          childRunId: receipt.childRunIds[ordinal]!,
        })),
      }
      return success(result)
    }).pipe(Effect.catch((error) => Effect.succeed(domainFailure(error))))

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

  return ChildRuns.of({ invoke, startGroup, awaitGroup })
}

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
  tools: [toolName, startGroupToolName, awaitGroupToolName],
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
        return yield* children.invoke({ ...input, parentRunId: context.runId!, toolCallId: context.toolCallId! })
      }
      if (request.call.name === startGroupToolName) {
        const input = yield* Schema.decodeUnknownEffect(StartGroupParameters)(request.call.params).pipe(
          Effect.mapError(() =>
            ToolExecutor.FrameworkFailure.make({
              stage: "decode-input",
              tool: startGroupToolName,
              message: "start_child_group requires 1-64 keyed children and bounded concurrency",
            }),
          ),
        )
        return yield* children.startGroup({ ...input, parentRunId: context.runId!, toolCallId: context.toolCallId! })
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
