import { Context, Effect, Function, Layer, Schema, Scope } from "effect"
import { digest } from "../durable/canonical-json.js"
import { CapabilityFailure, type ProgramCapabilities } from "./capabilities.js"

const positiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
const moduleName = Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(256)))

/** @experimental Exact normalized JavaScript module supplied to an isolated executor. */
export const Module = Schema.Struct({ name: moduleName, source: Schema.String })
/** @experimental */
export type Module = typeof Module.Type

/** @experimental Explicit capability authority admitted for one execution. */
export const CapabilityGrant = Schema.Struct({
  operation: Schema.Literals([
    "discoverTools",
    "describeTool",
    "callTool",
    "callStep",
    "runAgent",
    "mapAgents",
    "fanOutAgents",
    "log",
  ]),
  names: Schema.Array(Schema.String),
})
/** @experimental */
export type CapabilityGrant = typeof CapabilityGrant.Type

/** @experimental Canonical protocol version implemented by CodeExecutor adapters. */
export const protocolVersion = "1" as const

/** @experimental Complete immutable reconstruction request for one sandbox invocation. */
export interface Request {
  readonly protocolVersion: typeof protocolVersion
  readonly requestId: string
  readonly sourceDigest: string
  readonly modules: ReadonlyArray<Module>
  readonly entrypoint: string
  readonly inputCodec: string
  readonly outputCodec: string
  readonly input: unknown
  readonly deadlineMillis: number
  readonly signal: AbortSignal
  readonly limits: {
    readonly cpuMillis: number
    readonly subrequests: number
    readonly outputBytes: number
  }
  readonly capabilities: ReadonlyArray<CapabilityGrant>
}

/** @experimental Identity-bound encoded output returned by an isolated executor. */
export const Result = Schema.Struct({
  protocolVersion: Schema.Literal(protocolVersion),
  requestId: Schema.String,
  sourceDigest: Schema.String,
  inputCodec: Schema.String,
  outputCodec: Schema.String,
  output: Schema.Unknown,
})
/** @experimental */
export type Result = typeof Result.Type

/** @experimental */
export class SandboxUnavailable extends Schema.TaggedError<SandboxUnavailable>()("@tenetkit/core/SandboxUnavailable", {
  message: Schema.String,
}) {}
/** @experimental */
export class SandboxSourceInvalid extends Schema.TaggedError<SandboxSourceInvalid>()(
  "@tenetkit/core/SandboxSourceInvalid",
  {
    message: Schema.String,
  },
) {}
/** @experimental */
export class SandboxInputInvalid extends Schema.TaggedError<SandboxInputInvalid>()(
  "@tenetkit/core/SandboxInputInvalid",
  {
    message: Schema.String,
  },
) {}
/** @experimental */
export class SandboxOutputInvalid extends Schema.TaggedError<SandboxOutputInvalid>()(
  "@tenetkit/core/SandboxOutputInvalid",
  {
    message: Schema.String,
  },
) {}
/** @experimental */
export class SandboxProtocolViolation extends Schema.TaggedError<SandboxProtocolViolation>()(
  "@tenetkit/core/SandboxProtocolViolation",
  { message: Schema.String },
) {}
/** @experimental */
export class SandboxDeadlineExceeded extends Schema.TaggedError<SandboxDeadlineExceeded>()(
  "@tenetkit/core/SandboxDeadlineExceeded",
  { message: Schema.String },
) {}
/** @experimental */
export class SandboxCancelled extends Schema.TaggedError<SandboxCancelled>()("@tenetkit/core/SandboxCancelled", {
  message: Schema.String,
}) {}
/** @experimental */
export class SandboxResourceExceeded extends Schema.TaggedError<SandboxResourceExceeded>()(
  "@tenetkit/core/SandboxResourceExceeded",
  { resource: Schema.Literals(["cpu", "subrequests", "output"]), limit: positiveInt },
) {}
/** @experimental */
export class SandboxExecutionFailure extends Schema.TaggedError<SandboxExecutionFailure>()(
  "@tenetkit/core/SandboxExecutionFailure",
  { message: Schema.String },
) {}

/** @experimental Typed failures that may cross the sandbox capability protocol. */
export const ExecutionFailure = Schema.Union([
  SandboxUnavailable,
  SandboxSourceInvalid,
  SandboxInputInvalid,
  SandboxOutputInvalid,
  SandboxExecutionFailure,
  SandboxProtocolViolation,
  SandboxDeadlineExceeded,
  SandboxCancelled,
  SandboxResourceExceeded,
  CapabilityFailure,
])
/** @experimental */
export type ExecutionFailure = typeof ExecutionFailure.Type

/** @experimental Immutable JSON identity of one executor implementation and its enforced limits. */
export const Identity = Schema.Record(Schema.String, Schema.Json)
/** @experimental */
export type Identity = typeof Identity.Type

/** @experimental */
export interface Service {
  readonly identity: Identity
  readonly execute: (request: Request) => Effect.Effect<Result, ExecutionFailure, ProgramCapabilities | Scope.Scope>
}

/** @experimental Host-supplied isolated source executor. */
export class CodeExecutor extends Context.Service<CodeExecutor, Service>()(
  "tenetkit/core/program/code-executor/CodeExecutor",
) {}

/** @experimental Compute the sole digest representation for normalized source. */
export const sourceDigest = (input: {
  readonly modules: ReadonlyArray<Module>
  readonly entrypoint: string
  readonly inputCodec: string
  readonly outputCodec: string
  readonly protocolVersion?: typeof protocolVersion
}): string =>
  digest({
    protocolVersion: input.protocolVersion ?? protocolVersion,
    modules: input.modules
      .map(({ name, source }) => [name, source] as const)
      .toSorted(([left], [right]) => {
        if (left < right) return -1
        if (left > right) return 1
        return 0
      }),
    entrypoint: input.entrypoint,
    inputCodec: input.inputCodec,
    outputCodec: input.outputCodec,
  })

/** @experimental Synthesize the canonical single-module request used by current Program manifests. */
export const request = (input: {
  readonly requestId: string
  readonly source: string
  readonly inputCodec: string
  readonly outputCodec: string
  readonly encodedInput: unknown
  readonly signal: AbortSignal
  readonly nowMillis: number
  readonly wallTimeMillis: number
  readonly outputBytes: number
  readonly toolCalls: number
  readonly agentRuns: number
  readonly tools: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
  readonly agents: ReadonlyArray<string>
}): Request => {
  const modules = [{ name: "program.js", source: input.source }]
  const identity = { modules, entrypoint: "program.js", inputCodec: input.inputCodec, outputCodec: input.outputCodec }
  return {
    protocolVersion,
    requestId: input.requestId,
    sourceDigest: sourceDigest(identity),
    ...identity,
    input: input.encodedInput,
    signal: input.signal,
    deadlineMillis: input.nowMillis + input.wallTimeMillis,
    limits: {
      cpuMillis: Math.max(1, input.wallTimeMillis),
      subrequests: Math.max(1, input.toolCalls + input.agentRuns),
      outputBytes: input.outputBytes,
    },
    capabilities: [
      { operation: "discoverTools", names: input.tools },
      { operation: "describeTool", names: input.tools },
      { operation: "callTool", names: input.tools },
      { operation: "callStep", names: input.steps },
      { operation: "runAgent", names: input.agents },
      { operation: "mapAgents", names: input.agents },
      { operation: "fanOutAgents", names: input.agents },
      { operation: "log", names: [] },
    ],
  }
}

/** @experimental Identity carried by trusted fixture executors. */
export const testIdentity: Identity = Object.freeze({
  language: "javascript",
  implementation: "tenetkit/CodeExecutor/test",
  version: "1",
})

/** @experimental Trusted fixture executor for tests only. */
export type TestExecute = (
  request: Request,
) => Effect.Effect<unknown, ExecutionFailure, ProgramCapabilities | Scope.Scope>

/** @experimental Trusted fixture executor for tests only. */
export const make: {
  (identity?: Identity): (execute: TestExecute) => Service
  (execute: TestExecute, identity?: Identity): Service
} = Function.dual(
  (args) => args.length > 1 || !Schema.is(Identity)(args[0]),
  (execute: TestExecute, identity: Identity = testIdentity): Service =>
    CodeExecutor.of({
      identity: Object.freeze({ ...identity }),
      execute: (sandboxRequest) =>
        execute(sandboxRequest).pipe(
          Effect.map((value) =>
            Schema.is(Result)(value)
              ? value
              : {
                  protocolVersion: sandboxRequest.protocolVersion,
                  requestId: sandboxRequest.requestId,
                  sourceDigest: sandboxRequest.sourceDigest,
                  inputCodec: sandboxRequest.inputCodec,
                  outputCodec: sandboxRequest.outputCodec,
                  output: value,
                },
          ),
        ),
    }),
)

/** @experimental Trusted fixture Layer for tests only. It provides no source isolation. */
export const layerTest: {
  (identity?: Identity): (execute: TestExecute) => Layer.Layer<CodeExecutor>
  (execute: TestExecute, identity?: Identity): Layer.Layer<CodeExecutor>
} = Function.dual(
  (args) => args.length > 1 || !Schema.is(Identity)(args[0]),
  (execute: TestExecute, identity?: Identity): Layer.Layer<CodeExecutor> =>
    Layer.succeed(CodeExecutor, make(execute, identity)),
)
