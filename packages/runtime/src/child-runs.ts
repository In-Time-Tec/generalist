import { Context, Effect, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { ToolContext, ToolExecutor } from "@batonfx/core"
import type { Interface as RunStoreInterface } from "./run-store.js"
import { make as makeAddress } from "./address.js"
import { make as makeMessage } from "./message.js"
import { normalizePrompt } from "./memory/prompt.js"

export const Parameters = Schema.Struct({
  selection: Schema.String,
  prompt: Schema.String,
})

export const Result = Schema.Union([
  Schema.TaggedStruct("Succeeded", { childRunId: Schema.String, text: Schema.String, turns: Schema.Int }),
  Schema.TaggedStruct("Failed", { childRunId: Schema.String, message: Schema.String }),
  Schema.TaggedStruct("Cancelled", { childRunId: Schema.String, reason: Schema.optionalKey(Schema.String) }),
])

export const tool = Tool.make("run_child", {
  description: "Run one declared child Agent and wait for its durable result.",
  parameters: Parameters,
  success: Result,
})

export type Input = typeof Parameters.Type & {
  readonly parentRunId: string
  readonly toolCallId: string
}

export interface Interface {
  readonly invoke: (input: Input) => Effect.Effect<ToolExecutor.Outcome>
}

export class ChildRuns extends Context.Service<ChildRuns, Interface>()("@batonfx/runtime/ChildRuns") {}

export const make = (store: RunStoreInterface): Interface =>
  ChildRuns.of({
    invoke: (input) =>
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
          return { _tag: "Success" as const, result, encodedResult: result }
        }
        if (snapshot.outcome?._tag === "Failed") {
          const result = {
            _tag: "Failed" as const,
            childRunId: receipt.runId,
            message: snapshot.outcome.error.message,
          }
          return { _tag: "Success" as const, result, encodedResult: result }
        }
        if (snapshot.outcome?._tag === "Cancelled") {
          const result = {
            _tag: "Cancelled" as const,
            childRunId: receipt.runId,
            ...(snapshot.outcome.reason === undefined ? {} : { reason: snapshot.outcome.reason }),
          }
          return { _tag: "Success" as const, result, encodedResult: result }
        }
        return { _tag: "Suspend" as const, token: receipt.runId }
      }).pipe(
        Effect.catch((error) => {
          const failure = { message: "message" in error ? String(error.message) : String(error) }
          return Effect.succeed({ _tag: "DomainFailure" as const, failure, encodedFailure: failure })
        }),
      ),
  })

export const route: ToolExecutor.Route<ChildRuns | ToolContext.ToolContext> = ToolExecutor.route({
  tools: [tool.name],
  execute: (request) =>
    Effect.gen(function* () {
      const context = yield* ToolContext.ToolContext
      const children = yield* ChildRuns
      if (context.runId === undefined || context.toolCallId === undefined) {
        return yield* ToolExecutor.FrameworkFailure.make({
          stage: "handler",
          tool: tool.name,
          message: "run_child requires a Runtime-owned ToolContext",
        })
      }
      const input = yield* Schema.decodeUnknownEffect(Parameters)(request.call.params).pipe(
        Effect.mapError(() =>
          ToolExecutor.FrameworkFailure.make({
            stage: "decode-input",
            tool: tool.name,
            message: "run_child requires selection and prompt strings",
          }),
        ),
      )
      return yield* children.invoke({ ...input, parentRunId: context.runId, toolCallId: context.toolCallId })
    }),
})
