import { Function, Schema, type Stream } from "effect"
import { AgentSuspended, type Event, type SteeringDrained, ToolNameCollision } from "../event.js"
import { type Item, type Key, messageFromRecall } from "../../context/memory.js"
import { inputDigest } from "../../durable/driver/contract.js"
import type { Input } from "../../turn/steering.js"
import { StopReason } from "../../turn/policy.js"
import { Prompt, Tool } from "effect/unstable/ai"
import type { RunError } from "../service.js"
import type { ObjectSchema, SchemaServicesD, StaticToolServices } from "./context.js"

export type RunStream<Tools extends Record<string, Tool.Any>, S extends ObjectSchema, R> = Stream.Stream<
  Event,
  RunError,
  R | StaticToolServices<Tools> | SchemaServicesD<S>
>

export const suspensionApplicationIdentity = (suspension: AgentSuspended): string =>
  Function.pipe(suspension, Schema.encodeUnknownSync(AgentSuspended), inputDigest)

export const isToolNameCollision = Schema.is(ToolNameCollision)
const TurnPolicyDecision = Schema.Union([
  Schema.TaggedStruct("Continue", {}),
  Schema.TaggedStruct("Stop", { reason: StopReason }),
])
export const isTurnPolicyDecision = Schema.is(TurnPolicyDecision)

export interface SuspensionMetadata extends Record<string, Schema.Json> {
  token: string
  reason: string
  tool_call_batch_ids: ReadonlyArray<string>
}

export interface RecallInput {
  turn: number
  key?: Key
}

export interface RememberInput extends RecallInput {
  terminal: boolean
}

const steeringDrainedEvent = (
  turn: number,
  queue: SteeringDrained["queue"],
  inputs: ReadonlyArray<Input>,
): SteeringDrained => ({ _tag: "SteeringDrained", turn, queue, count: inputs.length })

const insertRecalledItems = (prompt: Prompt.Prompt, items: ReadonlyArray<Item>): Prompt.Prompt => {
  const content = items.flatMap((item) => item.content)
  if (content.length === 0) return prompt
  const memoryMessage = messageFromRecall(content)
  const [first, ...rest] = prompt.content
  return first?.role === "system"
    ? Prompt.fromMessages([first, memoryMessage, ...rest])
    : Prompt.fromMessages([memoryMessage, ...prompt.content])
}

export const RunSupport = { insertRecalledItems, steeringDrainedEvent }
