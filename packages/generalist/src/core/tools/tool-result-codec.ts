import { Effect, Schema } from "effect"
import { AiError, Response, Tool, Toolkit } from "effect/unstable/ai"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

type BoundaryValue = typeof Schema.Unknown.Type

export interface Success {
  readonly _tag: "Success"
  readonly result: BoundaryValue
  readonly encodedResult: BoundaryValue
  readonly memoized?: {
    readonly fromRun: string
    readonly fromOperation: string
  }
}

export interface DomainFailure {
  readonly _tag: "DomainFailure"
  readonly failure: BoundaryValue
  readonly encodedFailure: BoundaryValue
}

export interface Request {
  readonly call: Response.ToolCallPart<string, unknown>
  readonly toolCallBatch: {
    readonly calls: ReadonlyArray<Response.ToolCallPart<string, unknown>>
  }
  readonly turn: number
  readonly toolCallIndex: number
  readonly agentName: string
  readonly sessionId: string
}

export interface Suspend {
  readonly _tag: "Suspend"
  readonly token: string
}

/** Durable tool execution outcome. */
export const Outcome = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag("Success"),
    result: Schema.Unknown,
    encodedResult: Schema.Unknown,
    outputPaths: Schema.optionalKey(Schema.Array(Schema.String)),
    memoized: Schema.optionalKey(
      Schema.Struct({
        fromRun: Schema.String,
        fromOperation: Schema.String,
      }),
    ),
  }),
  Schema.Struct({ _tag: Schema.tag("DomainFailure"), failure: Schema.Unknown, encodedFailure: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.tag("Suspend"), token: Schema.String }),
])

export type Outcome = Success | DomainFailure | Suspend

export type ReplayPolicy = "never" | "provider-idempotent"

export const FrameworkStage = Schema.Literals([
  "decode-input",
  "handler",
  "encode-success",
  "encode-domain-failure",
  "missing-handler",
  "route",
  "placement",
  "authorization",
])
export type FrameworkStage = typeof FrameworkStage.Type

export class FrameworkFailure extends ActionableTaggedError<FrameworkFailure>()("generalist/core/FrameworkFailure", {
  stage: FrameworkStage,
  tool: Schema.String,
  message: Schema.String,
  hint: errorHint("Use stage and tool to repair the failing tool boundary, then retry the call."),
}) {}

export class RemoteRetryMisconfigured extends ActionableTaggedError<RemoteRetryMisconfigured>()(
  "generalist/core/RemoteRetryMisconfigured",
  {
    reason: Schema.Literals(["invalid-max-retries", "missing-operation-key", "changed-operation-key"]),
    message: Schema.String,
    hint: errorHint("Use a finite retry count and one stable operation key for every retry attempt."),
  },
) {}

const resultMessage = (result: BoundaryValue): string => {
  if (Schema.is(Schema.String)(result)) return result
  if (Schema.is(Schema.instanceOf(Error))(result)) return `${result.name}: ${result.message}`
  try {
    const message = JSON.stringify(result)
    return message === undefined ? String(result) : message
  } catch {
    return String(result)
  }
}

const schemaMessage = (error: BoundaryValue): string => {
  if (Schema.is(Schema.instanceOf(Error))(error)) return error.message
  if (Schema.is(Schema.String)(error)) return error
  return resultMessage(error)
}

const frameworkFailure = (stage: FrameworkStage, tool: string, error: BoundaryValue): FrameworkFailure =>
  FrameworkFailure.make({ stage, tool, message: schemaMessage(error) })

export type SchemaTool = {
  readonly name: string
  readonly parametersSchema: Schema.Constraint
  readonly successSchema: Schema.Constraint
  readonly failureSchema: Schema.Constraint
}
export type ToolkitInput<Tools extends Record<string, Tool.Any>> = Toolkit.Toolkit<Tools> | Toolkit.WithHandler<Tools>
export interface ClosedToolSet<R = unknown, T extends SchemaTool = SchemaTool> {
  readonly tools: Readonly<Record<string, T>>
  readonly invoke: (
    name: string,
    params: typeof Schema.Unknown.Type,
  ) => Effect.Effect<typeof Schema.Unknown.Type, typeof Schema.Unknown.Type, R>
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
  result: S["Type"],
): Effect.Effect<Success, FrameworkFailure, S["EncodingServices"]> =>
  Schema.encodeEffect(tool.successSchema)(result).pipe(
    Effect.map((encodedResult): Success => ({ _tag: "Success", result, encodedResult })),
    Effect.mapError((error) => frameworkFailure("encode-success", tool.name, error)),
  )

const encodeDomainFailure = <S extends Schema.Constraint>(
  tool: { readonly name: string; readonly failureSchema: S },
  failure: S["Type"],
): Effect.Effect<DomainFailure, FrameworkFailure, S["EncodingServices"]> =>
  Schema.encodeEffect(tool.failureSchema)(failure).pipe(
    Effect.map((encodedFailure): DomainFailure => ({ _tag: "DomainFailure", failure, encodedFailure })),
    Effect.mapError((error) => frameworkFailure("encode-domain-failure", tool.name, error)),
  )

const encodeDomainCandidate = <S extends Schema.Constraint>(
  tool: { readonly name: string; readonly failureSchema: S },
  failure: BoundaryValue,
): Effect.Effect<DomainFailure, FrameworkFailure, S["EncodingServices"]> =>
  !Schema.is(tool.failureSchema)(failure)
    ? Effect.fail(frameworkFailure("handler", tool.name, failure))
    : encodeDomainFailure(tool, failure)

const decodeInput = <S extends Schema.Constraint>(
  tool: { readonly name: string; readonly parametersSchema: S },
  input: BoundaryValue,
): Effect.Effect<S["Type"], FrameworkFailure, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(tool.parametersSchema)(input).pipe(
    Effect.mapError((error) => frameworkFailure("decode-input", tool.name, error)),
  )

const decodeSuccess = <S extends Schema.Constraint>(
  tool: { readonly name: string; readonly successSchema: S },
  result: BoundaryValue,
): Effect.Effect<Success, FrameworkFailure, S["DecodingServices"] | S["EncodingServices"]> =>
  Schema.decodeUnknownEffect(tool.successSchema)(result).pipe(
    Effect.mapError((error) => frameworkFailure("encode-success", tool.name, error)),
    Effect.flatMap((decoded) => encodeSuccess<S>(tool, decoded)),
  )

type AiFailureTool = Pick<SchemaTool, "name" | "successSchema" | "failureSchema"> & {
  readonly failureMode: Tool.FailureMode
}

const aiFrameworkFailure = (tool: AiFailureTool, error: AiError.AiError): FrameworkFailure => {
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
      let stage: FrameworkStage = "encode-success"
      if (isSuccess === isDomainFailure) stage = "handler"
      else if (isDomainFailure) stage = "encode-domain-failure"
      return frameworkFailure(stage, tool.name, error)
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
