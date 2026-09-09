import type { Tool } from "effect/unstable/ai"
import type { RunId } from "../../core/durable/run-id.js"
import { Effect, Option, Schema, Stream } from "effect"
import { InvalidOutput } from "../../core/agent/event.js"
import { generateId } from "../../core/model/telemetry/events.js"
import { digest } from "../../core/durable/canonical-json.js"
import { origin } from "../cursor.js"
import { ExecutableRegistrationInvalid, RunKindUnsupported, RuntimeUnavailable } from "../errors.js"
import { capture, type RegisteredTool } from "../executable/registered-tool.js"
import type { RegisteredAgents } from "../executable/registered-agent.js"
import type { Service as RunStore } from "../run/store.js"
import type {
  Service,
  StartExecutionInput,
  StartExecutionError,
  StartReceipt,
  ToolRunEvent,
  ToolRunHandle,
  ToolStartOptions,
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
  const handle = <T extends Tool.Any>(
    tool: T,
    runId: RunId,
    registration: RegisteredTool,
  ): ToolRunHandle<T["successSchema"]["Type"], T["failureSchema"]["Type"]> => {
    const decode = <S extends Schema.Top>(schema: S, value: S["Encoded"]) =>
      Schema.decodeUnknownEffect(schema)(value).pipe(Effect.provideContext(registration.context))
    const events = options.store.events({ runId, cursor: origin }).pipe(
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
      runId,
      events,
      inspect: options.inspect(runId),
      cancel: (cancelCommandId: string, reason?: string) =>
        options.cancel({
          runId,
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
          ): ToolRunHandle<(typeof tool)["successSchema"]["Type"], (typeof tool)["failureSchema"]["Type"]>["await"] => {
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
  }
  const getTool: Service["getTool"] = (tool, runId) =>
    Effect.gen(function* () {
      const run = yield* options.store.inspect(runId)
      const entry = run.executableManifest.entries.find((candidate) => candidate.pin === run.executableRef.active)
      if (entry === undefined)
        return yield* ExecutableRegistrationInvalid.make({ message: "Run executable entry is missing" })
      if (entry._tag !== "Tool")
        return yield* RunKindUnsupported.make({ runId, operation: "getTool", kind: entry._tag })
      const registration = yield* options.agents.getTool(tool)
      if (Option.isNone(registration) || registration.value.resolution.pinned.pin !== entry.pin)
        return yield* ExecutableRegistrationInvalid.make({
          message: `Tool ${tool.name} does not match the retained Tool Run registration`,
        })
      return handle(tool, run.runId, registration.value)
    })
  const registerTool: Service["registerTool"] = (tool) =>
    capture(tool).pipe(Effect.flatMap(options.agents.registerTool))
  const startRegisteredTool = <T extends Tool.Any, Encoded>(
    tool: T,
    registration: RegisteredTool,
    encoded: Encoded,
    startOptions: ToolStartOptions = {},
  ) =>
    Effect.gen(function* () {
      const commandId = startOptions.commandId ?? `tool_${yield* generateId}`
      if (startOptions.parentRunId !== undefined) yield* options.store.inspect(startOptions.parentRunId)
      const receipt = yield* options.admitStart(
        {
          executable: registration.resolution.attestation,
          registrations: registration.registrations,
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
      return handle(tool, receipt.runId, registration)
    })
  const registeredTool = (tool: Tool.Any) =>
    options.agents.getTool(tool).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            ExecutableRegistrationInvalid.make({
              message: `Tool ${tool.name} is not registered. Pass it in Host.make({ revision: "local", tools: [...] }).`,
            }),
          onSome: Effect.succeed,
        }),
      ),
    )
  const startTool: Service["startTool"] = (tool, input, startOptions = {}) =>
    Effect.gen(function* () {
      const registration = yield* registeredTool(tool)
      const encoded = yield* Schema.encodeEffect(registration.resolution.input)(input).pipe(
        Effect.mapError((error) => ExecutableRegistrationInvalid.make({ message: error.message })),
      )
      return yield* startRegisteredTool(tool, registration, encoded, startOptions)
    })
  const startToolEncoded: Service["startToolEncoded"] = (tool, input, startOptions = {}) =>
    Effect.gen(function* () {
      const registration = yield* registeredTool(tool)
      yield* Schema.decodeEffect(registration.resolution.input)(input).pipe(
        Effect.provideContext(registration.context),
        Effect.mapError((error) => ExecutableRegistrationInvalid.make({ message: error.message })),
      )
      return yield* startRegisteredTool(tool, registration, input, startOptions)
    })
  return { registerTool, startTool, startToolEncoded, getTool }
}
