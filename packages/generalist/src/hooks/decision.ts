import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Event } from "./event.js"

const ContinueDecision = Schema.TaggedStruct("Continue", {})
const BlockDecision = Schema.TaggedStruct("Block", { reason: Schema.String })
const ReplaceDecision = Schema.TaggedStruct("Replace", { value: Schema.Unknown })
const AddContextDecision = Schema.TaggedStruct("AddContext", { prompt: Prompt.Prompt })
const AskDecision = Schema.TaggedStruct("Ask", {})

/** Serializable decision recorded in the durable driver checkpoint. */
export const Decision = Schema.Union([
  ContinueDecision,
  BlockDecision,
  ReplaceDecision,
  AddContextDecision,
  AskDecision,
])

const promptDecision = Schema.Union([ContinueDecision, BlockDecision, ReplaceDecision, AddContextDecision])
const toolCallDecision = Schema.Union([ContinueDecision, BlockDecision, ReplaceDecision, AskDecision])
const toolResultDecision = Schema.Union([ContinueDecision, BlockDecision, ReplaceDecision])
const approvalDecision = Schema.Union([ContinueDecision, BlockDecision])
const childStartDecision = Schema.Union([ContinueDecision, BlockDecision])
const childEndDecision = Schema.Union([ContinueDecision, BlockDecision, ReplaceDecision])
const runEndDecision = Schema.Union([ContinueDecision, BlockDecision, ReplaceDecision])

/** Event-scoped decision Schema enforced at each lifecycle boundary. */
export const DecisionByEvent = {
  RunStart: promptDecision,
  TurnStart: promptDecision,
  ModelCall: promptDecision,
  Compaction: promptDecision,
  Steer: promptDecision,
  ToolCall: toolCallDecision,
  ToolResult: toolResultDecision,
  ApprovalRequest: approvalDecision,
  ChildStart: childStartDecision,
  ChildEnd: childEndDecision,
  RunEnd: runEndDecision,
} satisfies Record<Event, Schema.Decoder<typeof Decision.Type>>
