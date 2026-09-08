import { Effect, Option, Schema, Stream } from "effect"
import { InvalidOutput } from "../../core/agent/event.js"
import { generateId } from "../../core/model/telemetry/events.js"
import { digest } from "../../core/durable/canonical-json.js"
import { origin } from "../cursor.js"
import { ExecutableRegistrationInvalid, RuntimeUnavailable } from "../errors.js"
import { capture } from "../executable/registered-tool.js"
import type { RegisteredAgents } from "../executable/registered-agent.js"
import type { Service as RunStore } from "../run/store.js"
import type {
  Service,
  StartExecutionInput,
  StartExecutionError,
  StartReceipt,
  ToolRunEvent,
  ToolRunHandle,
} from "../service.js"

export const Input = Schema.Struct({ input: Schema.Unknown, parentRunId: Schema.optionalKey(Schema.String) })

export const make = (options: {
  readonly agents: RegisteredAgents
  readonly store: RunStore
  readonly admitStart: (
    input: StartExecutionInput,
    activate: boolean,
  ) => Effect.Effect<StartReceipt, StartExecutionError>
  readonly cancel: Service["cancel"]
  readonly inspect: Service["inspect"]
}) => {
  const registerTool: Service["registerTool"] = (tool) =>
    capture(tool).pipe(Effect.flatMap(options.agents.registerTool))
  const startTool: Service["startTool"] = (tool, input, startOptions = {}) =>
    Effect.gen(function* () {
      const registration = yield* options.agents.getTool(tool)
      if (Option.isNone(registration))
        return yield* ExecutableRegistrationInvalid.make({
          message: `Tool ${tool.name} is not registered. Pass it in Generalist.create({ tools: [...] }).`,
        })
      const encoded = yield* Schema.encodeEffect(registration.value.resolution.input)(input).pipe(
        Effect.mapError((error) => ExecutableRegistrationInvalid.make({ message: error.message })),
      )
      const commandId = startOptions.commandId ?? `tool_${yield* generateId}`
      if (startOptions.parentRunId !== undefined) yield* options.store.inspect(startOptions.parentRunId)
      const receipt = yield* options.admitStart(
        {
          executable: registration.value.resolution.attestation,
          registrations: registration.value.registrations,
          sessionId: `tool:${digest([startOptions.parentRunId ?? null, commandId])}`,
          idempotencyKey: commandId,
          prompt: "",
          metadata: {
            tool: {
              input: encoded,
              ...(startOptions.parentRunId === undefined ? undefined : { parentRunId: startOptions.parentRunId }),
            },
          },
        },
        true,
      )
      const decode = <S extends Schema.Top>(schema: S, value: S["Encoded"]) =>
        Schema.decodeUnknownEffect(schema)(value).pipe(Effect.provideContext(registration.value.context))
      const events = options.store.events({ runId: receipt.runId, cursor: origin }).pipe(
        Stream.mapEffect(
          (
            event,
          ): Effect.Effect<
            ToolRunEvent<(typeof tool)["successSchema"]["Type"], (typeof tool)["failureSchema"]["Type"]>,
            InvalidOutput
          > => {
            if (event._tag !== "RunCompleted") return Effect.succeed(event)
            if (!("_tag" in event.result) || event.result._tag !== "Tool")
              return InvalidOutput.make({ issues: ["Tool Run completed with a non-Tool result"] })
            if (event.result.isFailure)
              return decode(tool.failureSchema, event.result.value).pipe(
                Effect.map((value) => ({
                  ...event,
                  result: { _tag: "Tool" as const, isFailure: true as const, value },
                })),
                Effect.mapError((error) => InvalidOutput.make({ issues: [error.message] })),
              )
            return decode(tool.successSchema, event.result.value).pipe(
              Effect.map((value) => ({
                ...event,
                result: { _tag: "Tool" as const, isFailure: false as const, value },
              })),
              Effect.mapError((error) => InvalidOutput.make({ issues: [error.message] })),
            )
          },
        ),
        Stream.takeUntil(
          (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
        ),
      )
      return {
        runId: receipt.runId,
        events,
        inspect: options.inspect(receipt.runId),
        cancel: (cancelCommandId: string, reason?: string) =>
          options.cancel({
            runId: receipt.runId,
            commandId: cancelCommandId,
            ...(reason === undefined ? undefined : { reason }),
          }),
        await: events.pipe(
          Stream.filter(
            (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
          ),
          Stream.runHead,
          Effect.flatMap(
            (
              event,
            ): ToolRunHandle<
              (typeof tool)["successSchema"]["Type"],
              (typeof tool)["failureSchema"]["Type"]
            >["await"] => {
              if (Option.isNone(event))
                return RuntimeUnavailable.make({ message: "Tool Run stream ended before settlement" })
              if (event.value._tag !== "RunCompleted") return Effect.fail(event.value)
              if (event.value.result.isFailure)
                return Effect.fail({ _tag: "ToolRunFailure" as const, failure: event.value.result.value })
              return Effect.succeed(event.value.result.value)
            },
          ),
        ),
      }
    })
  return { registerTool, startTool }
}
