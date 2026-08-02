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

const SchemaServices = Context.Service<unknown>("@batonfx/core/SchemaServices")
const schemaContext = Context.make(SchemaServices, undefined)

const encodeSuccess = (tool: Tool.Any, result: unknown): Effect.Effect<Success, FrameworkFailure> => {
  return Schema.encodeUnknownEffect(tool.successSchema)(result).pipe(
    Effect.provide(schemaContext),
    Effect.map((encodedResult): Success => ({ _tag: "Success", result, encodedResult })),
    Effect.mapError((error) => frameworkFailure("encode-success", tool.name, error)),
  )
}

const encodeDomainFailure = (tool: Tool.Any, failure: unknown): Effect.Effect<DomainFailure, FrameworkFailure> => {
  return Schema.encodeUnknownEffect(tool.failureSchema)(failure).pipe(
    Effect.provide(schemaContext),
    Effect.map((encodedFailure): DomainFailure => ({ _tag: "DomainFailure", failure, encodedFailure })),
    Effect.mapError((error) => frameworkFailure("encode-domain-failure", tool.name, error)),
  )
}

const encodeDomainCandidate = (tool: Tool.Any, failure: unknown): Effect.Effect<DomainFailure, FrameworkFailure> =>
  !Schema.is(tool.failureSchema)(failure)
    ? Effect.fail(frameworkFailure("handler", tool.name, failure))
    : encodeDomainFailure(tool, failure)

const decodeInput = (tool: Tool.Any, input: unknown): Effect.Effect<unknown, FrameworkFailure> => {
  return Schema.decodeUnknownEffect(tool.parametersSchema)(input).pipe(
    Effect.provide(schemaContext),
    Effect.mapError((error) => frameworkFailure("decode-input", tool.name, error)),
  )
}

const decodeSuccess = (tool: Tool.Any, result: unknown): Effect.Effect<Success, FrameworkFailure> => {
  return Schema.decodeUnknownEffect(tool.successSchema)(result).pipe(
    Effect.provide(schemaContext),
    Effect.mapError((error) => frameworkFailure("encode-success", tool.name, error)),
    Effect.flatMap((decoded) => encodeSuccess(tool, decoded)),
  )
}

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

export const toolResultCodec = {
  aiFrameworkFailure,
  decodeInput,
  decodeSuccess,
  encodeDomainCandidate,
  encodeDomainFailure,
  encodeSuccess,
  frameworkFailure,
  resultMessage,
  schemaMessage,
}
