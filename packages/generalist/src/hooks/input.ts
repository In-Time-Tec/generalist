import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { HookFailed, type Event } from "./event.js"

const base = { agentName: Schema.String }
const turn = { ...base, turn: Schema.Finite }
const prompt = Schema.Struct({ ...turn, prompt: Prompt.Prompt })
const tool = { ...turn, tool: Schema.String, args: Schema.Unknown, call: Schema.Unknown }
const child = Schema.Struct({
  operation: Schema.String,
  selection: Schema.String,
  prompt: Schema.optionalKey(Prompt.Prompt),
  childRunId: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.String),
})
export const runEnd = <S extends Schema.Top>(output: S) =>
  Schema.Struct({
    ...base,
    turns: Schema.Finite,
    text: Schema.String,
    output,
    transcript: Prompt.Prompt,
  })

const inputs = {
  RunStart: Schema.Struct({ ...base, input: Prompt.Prompt }),
  TurnStart: prompt,
  ModelCall: prompt,
  ToolCall: Schema.Struct(tool),
  ToolResult: Schema.Struct({ ...tool, result: Schema.Unknown }),
  ApprovalRequest: Schema.Struct({
    ...turn,
    call: Schema.Unknown,
    request: Schema.Struct({
      approvalId: Schema.String,
      operation: Schema.String,
      capability: Schema.String,
      input: Schema.Unknown,
    }),
  }),
  Compaction: Schema.Struct({ ...turn, before: Prompt.Prompt, overflow: Schema.Boolean }),
  ChildStart: Schema.Struct({ ...turn, child }),
  ChildEnd: Schema.Struct({ ...turn, child, result: Schema.Unknown }),
  Steer: Schema.Struct({
    ...turn,
    prompt: Prompt.Prompt,
    queue: Schema.Literals(["steering", "followUp"]),
    count: Schema.Finite,
  }),
  RunEnd: runEnd(Schema.Unknown),
}

export const encode = <S extends Schema.Top = typeof Schema.Unknown>(input: {
  readonly event: Event
  readonly value: unknown
  readonly outputSchema?: S | undefined
}): Effect.Effect<Schema.Json, HookFailed, S["EncodingServices"]> =>
  Schema.encodeUnknownEffect(
    Schema.toCodecJson(
      input.event === "RunEnd" && input.outputSchema !== undefined ? runEnd(input.outputSchema) : inputs[input.event],
    ),
  )(input.value).pipe(Effect.mapError((cause) => HookFailed.make({ event: input.event, cause })))
