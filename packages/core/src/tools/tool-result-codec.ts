import { Context, Effect, Schema } from "effect"
import { AiError, Tool } from "effect/unstable/ai"
import { FrameworkFailure, type FrameworkStage, type DomainFailure, type Success } from "./tool-executor.js"

const resultMessage = (result: unknown): string => {
  if (typeof result === "string") return result
  if (result instanceof Error) return `${result.name}: ${result.message}`
  try {
    const message = JSON.stringify(result)
    return message === undefined ? String(result) : message
  } catch {
    return String(result)
  }
}

const schemaMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === "string" ? error : resultMessage(error)

const frameworkFailure = (stage: FrameworkStage, tool: string, error: unknown): FrameworkFailure =>
  FrameworkFailure.make({ stage, tool, message: schemaMessage(error) })

class SchemaServicesContext extends Context.Service<SchemaServicesContext, unknown>()("@batonfx/core/tools/tool-result-codec/SchemaServicesContext") {}
const schemaServicesContext = Context.make<unknown, unknown>(SchemaServicesContext, undefined)

export type SchemaTool = {
  readonly name: string
  readonly parametersSchema: Schema.Constraint
  readonly successSchema: Schema.Constraint
  readonly failureSchema: Schema.Constraint
}
export type FailureSchema<T extends SchemaTool> = T["failureSchema"]
export type ToolSchemaServices<T extends SchemaTool> =
  | T["parametersSchema"]["EncodingServices"]
  | T["parametersSchema"]["DecodingServices"]
  | T["successSchema"]["EncodingServices"]
  | T["successSchema"]["DecodingServices"]
  | T["failureSchema"]["EncodingServices"]
  | T["failureSchema"]["DecodingServices"]
const encodeSuccess = <S extends Schema.Constraint>(
  tool: { readonly name: string; readonly successSchema: S },
  result: unknown,
): Effect.Effect<Success, FrameworkFailure, S["EncodingServices"]> =>
  Schema.encodeUnknownEffect<S>(tool.successSchema)(result).pipe(
    Effect.map((encodedResult): Success => ({ _tag: "Success", result, encodedResult })),
    Effect.mapError((error) => frameworkFailure("encode-success", tool.name, error)),
  )

const encodeDomainFailure = <S extends Schema.Constraint>(
  tool: { readonly name: string; readonly failureSchema: S },
  failure: unknown,
): Effect.Effect<DomainFailure, FrameworkFailure, S["EncodingServices"]> =>
  Schema.encodeUnknownEffect<S>(tool.failureSchema)(failure).pipe(
    Effect.map((encodedFailure): DomainFailure => ({ _tag: "DomainFailure", failure, encodedFailure })),
    Effect.mapError((error) => frameworkFailure("encode-domain-failure", tool.name, error)),
  )

const encodeDomainCandidate = <S extends Schema.Constraint>(
  tool: { readonly name: string; readonly failureSchema: S },
  failure: unknown,
): Effect.Effect<DomainFailure, FrameworkFailure, S["EncodingServices"]> =>
  !Schema.is(tool.failureSchema)(failure)
    ? Effect.fail(frameworkFailure("handler", tool.name, failure))
    : encodeDomainFailure(tool, failure)

const decodeInput = <S extends Schema.Constraint>(
  tool: { readonly name: string; readonly parametersSchema: S },
  input: unknown,
): Effect.Effect<S["Type"], FrameworkFailure, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect<S>(tool.parametersSchema)(input).pipe(
    Effect.mapError((error) => frameworkFailure("decode-input", tool.name, error)),
  )

const decodeSuccess = <S extends Schema.Constraint>(
  tool: { readonly name: string; readonly successSchema: S },
  result: unknown,
): Effect.Effect<Success, FrameworkFailure, S["DecodingServices"] | S["EncodingServices"]> =>
  Schema.decodeUnknownEffect<S>(tool.successSchema)(result).pipe(
    Effect.mapError((error) => frameworkFailure("encode-success", tool.name, error)),
    Effect.flatMap((decoded) => encodeSuccess(tool, decoded)),
  )

const aiFrameworkFailure = (tool: Tool.Any, error: AiError.AiError): FrameworkFailure => {
  switch (error.reason._tag) {
    case "ToolParameterValidationError":
      return frameworkFailure("decode-input", tool.name, error)
    case "ToolNotFoundError":
      return frameworkFailure("missing-handler", tool.name, error)
    case "InvalidToolResultError":
      return frameworkFailure("handler", tool.name, error)
    case "ToolResultEncodingError": {
      if (tool.failureMode === "error") return frameworkFailure("encode-success", tool.name, error)
      const isSuccess = Schema.isSchema(tool.successSchema) && Schema.is(tool.successSchema)(error.reason.toolResult)
      const isDomainFailure =
        Schema.isSchema(tool.failureSchema) && Schema.is(tool.failureSchema)(error.reason.toolResult)
      return frameworkFailure(
        isSuccess === isDomainFailure ? "handler" : isDomainFailure ? "encode-domain-failure" : "encode-success",
        tool.name,
        error,
      )
    }
    default:
      return frameworkFailure("handler", tool.name, error)
  }
}

const provideSchemaServices = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, never> =>
  effect.pipe(Effect.provideContext(schemaServicesContext))

export const toolResultCodec = {
  aiFrameworkFailure,
  decodeInput,
  decodeSuccess,
  encodeDomainCandidate,
  encodeDomainFailure,
  encodeSuccess,
  frameworkFailure,
  provideSchemaServices,
  resultMessage,
  schemaMessage,
}
