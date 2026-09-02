/* oxlint-disable effecttsgo/missing-pipeable-signature -- Private prompt projection functions have direct internal call sites. */
import { Context, Effect, Layer, Option, Schema } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import type { Any as AnyAgent } from "../core/agent/lifecycle/definition.js"
import { DriverInterpreter } from "../core/durable/driver/interpreter.js"
import { LoopDriverState } from "../core/durable/loop-driver-state.js"
import { DriverStateInvalid } from "../core/durable/service.js"
import { Items, readToolName, writeToolName, type Items as TaskItems } from "./item.js"

const readTool = Tool.make(readToolName, {
  description: "Read the current journaled task list.",
  parameters: Schema.Struct({}),
  success: Items,
  failure: DriverStateInvalid,
  failureMode: "return",
  dependencies: [DriverInterpreter],
})
const writeTool = Tool.make(writeToolName, {
  description: "Replace the complete journaled task list. Preserve every task that should remain on the list.",
  parameters: Schema.Struct({ items: Items }),
  success: Items,
  failure: DriverStateInvalid,
  failureMode: "return",
})
const toolkit = Toolkit.make(readTool, writeTool)

export interface Service {
  readonly tools: ReadonlyArray<Tool.Any>
}

export class Configuration extends Context.Service<Configuration, Service>()(
  "generalist/tasks/internal/Configuration",
) {}

export const currentOption: Effect.Effect<Option.Option<TaskItems>, DriverStateInvalid, DriverInterpreter> = Effect.gen(
  function* () {
    const driver = yield* DriverInterpreter
    return yield* driver.checkpoint.pipe(
      Effect.flatMap((checkpoint) => Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state)),
      Effect.map((state) => Option.fromUndefinedOr(state.tasks)),
      Effect.mapError((error) => DriverStateInvalid.make({ message: `Invalid task checkpoint: ${error.message}` })),
    )
  },
)

export const current: Effect.Effect<TaskItems, DriverStateInvalid, DriverInterpreter> = currentOption.pipe(
  Effect.map(Option.getOrElse(() => [])),
)

const handlers = toolkit.toLayer({
  tasks_read: () => current,
  tasks_write: ({ items }) => Effect.succeed(items),
})

export const layer = Layer.merge(
  Layer.succeed(Configuration, Configuration.of({ tools: [readTool, writeTool] })),
  handlers,
)

export const eventFields = (input: {
  readonly name: string
  readonly isFailure: boolean
  readonly result: unknown
}) => {
  if (input.name !== writeToolName || input.isFailure) return {}
  const items = Schema.decodeUnknownOption(Items)(input.result)
  return Option.isSome(items) ? { tasksUpdated: items.value } : {}
}

const currentMarker = "<generalist-tasks>"

export const format = (items: TaskItems): string =>
  [
    currentMarker,
    "Current journaled task list. Use tasks_write with the complete replacement to change it.",
    JSON.stringify(Schema.encodeSync(Items)(items)),
    "</generalist-tasks>",
  ].join("\n")

const messageText = (message: Prompt.Message): string =>
  Schema.is(Schema.String)(message.content)
    ? message.content
    : message.content.filter(Schema.is(Schema.String)).join("\n")

const isCurrentTaskMessage = (message: Prompt.Message): boolean =>
  message.role === "system" && messageText(message).startsWith(currentMarker)

export const withCurrent = (prompt: Prompt.Prompt, items: TaskItems): Prompt.Prompt => {
  const messages = prompt.content.filter((message) => !isCurrentTaskMessage(message))
  const position = messages.findIndex((message) => message.role !== "system")
  const index = position === -1 ? messages.length : position
  const taskMessage = Prompt.makeMessage("system", { content: format(items) })
  return Prompt.fromMessages([...messages.slice(0, index), taskMessage, ...messages.slice(index)])
}

export const retain = <Result extends { readonly history: Prompt.Prompt; readonly prompt: Prompt.Prompt }>(
  result: Result,
  items: TaskItems,
): Result => ({
  ...result,
  history: withCurrent(result.history, items),
  prompt: Prompt.fromMessages(result.prompt.content.filter((message) => !isCurrentTaskMessage(message))),
})

const inherited = (items: TaskItems): string =>
  [
    '<generalist-inherited-tasks readonly="true">',
    "Read-only snapshot of the parent Run's task list. You cannot change the parent's list.",
    JSON.stringify(Schema.encodeSync(Items)(items)),
    "</generalist-inherited-tasks>",
  ].join("\n")

export const withInherited = <A extends AnyAgent>(agent: A, items: TaskItems): A => ({
  ...agent,
  instructions: agent.instructions === undefined ? inherited(items) : `${agent.instructions}\n\n${inherited(items)}`,
})
