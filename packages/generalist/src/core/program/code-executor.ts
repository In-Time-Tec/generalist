import { Context, Effect, Function, Layer, Schema, Scope } from "effect"
import { digest } from "../durable/canonical-json.js"
import { CapabilityFailure, type ProgramCapabilities } from "./capabilities.js"

const positiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
const moduleName = Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(256)))
const identityText = Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(512)))
const guaranteeName = Schema.Literals([
  "physicalIsolation",
  "persistence",
  "network",
  "deadlineMillis",
  "cpuMillis",
  "subrequests",
  "outputBytes",
  "filesystem",
  "processes",
])
const Enforcement = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("enforced"),
    by: Schema.Literals(["adapter", "provider", "runtime"]),
    mechanism: identityText,
  }),
  Schema.Struct({ status: Schema.Literal("unenforced"), reason: identityText }),
])
const LimitEnforcement = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("enforced"),
    by: Schema.Literals(["adapter", "provider", "runtime"]),
    mechanism: identityText,
    maximum: Schema.NullOr(positiveInt),
  }),
  Schema.Struct({ status: Schema.Literal("unenforced"), reason: identityText }),
])

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
export class SandboxUnavailable extends Schema.TaggedError<SandboxUnavailable>()("generalist/core/SandboxUnavailable", {
  message: Schema.String,
}) {}
/** @experimental */
export class SandboxSourceInvalid extends Schema.TaggedError<SandboxSourceInvalid>()(
  "generalist/core/SandboxSourceInvalid",
  {
    message: Schema.String,
  },
) {}
/** @experimental */
export class SandboxInputInvalid extends Schema.TaggedError<SandboxInputInvalid>()(
  "generalist/core/SandboxInputInvalid",
  {
    message: Schema.String,
  },
) {}
/** @experimental */
export class SandboxOutputInvalid extends Schema.TaggedError<SandboxOutputInvalid>()(
  "generalist/core/SandboxOutputInvalid",
  {
    message: Schema.String,
  },
) {}
/** @experimental */
export class SandboxProtocolViolation extends Schema.TaggedError<SandboxProtocolViolation>()(
  "generalist/core/SandboxProtocolViolation",
  { message: Schema.String },
) {}
/** @experimental */
export class SandboxDeadlineExceeded extends Schema.TaggedError<SandboxDeadlineExceeded>()(
  "generalist/core/SandboxDeadlineExceeded",
  { message: Schema.String },
) {}
/** @experimental */
export class SandboxCancelled extends Schema.TaggedError<SandboxCancelled>()("generalist/core/SandboxCancelled", {
  message: Schema.String,
}) {}
/** @experimental */
export class SandboxResourceExceeded extends Schema.TaggedError<SandboxResourceExceeded>()(
  "generalist/core/SandboxResourceExceeded",
  { resource: Schema.Literals(["cpu", "subrequests", "output"]), limit: positiveInt },
) {}
/** @experimental */
export class SandboxGuaranteeUnavailable extends Schema.TaggedError<SandboxGuaranteeUnavailable>()(
  "generalist/core/SandboxGuaranteeUnavailable",
  { guarantee: guaranteeName, message: Schema.String },
) {}
/** @experimental */
export class SandboxExecutionFailure extends Schema.TaggedError<SandboxExecutionFailure>()(
  "generalist/core/SandboxExecutionFailure",
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
  SandboxGuaranteeUnavailable,
  CapabilityFailure,
])
/** @experimental */
export type ExecutionFailure = typeof ExecutionFailure.Type

/** @experimental Persistable provider facts and exact guarantees enforced for every invocation. */
export const Identity = Schema.Struct({
  provider: identityText,
  implementation: Schema.Struct({ name: identityText, version: identityText }),
  runtime: Schema.Struct({ name: identityText, version: identityText }),
  template: Schema.Struct({ name: identityText, version: identityText }),
  physicalIsolation: Schema.Literals([
    "worker-isolate",
    "microvm",
    "sidecar-process-v8-isolate",
    "trusted-test",
    "none",
  ]),
  persistence: Schema.Literals(["fresh-per-execution", "trusted-fixture", "none"]),
  network: Schema.Struct({
    posture: Schema.Literals(["default-deny", "unrestricted", "host", "none"]),
    enforcement: Enforcement,
  }),
  limits: Schema.Struct({
    deadlineMillis: LimitEnforcement,
    cpuMillis: LimitEnforcement,
    subrequests: LimitEnforcement,
    outputBytes: LimitEnforcement,
    filesystem: Enforcement,
    processes: Enforcement,
  }),
  knownLimitations: Schema.Array(identityText).pipe(Schema.check(Schema.isMaxLength(16))),
})
/** @experimental */
export type Identity = typeof Identity.Type

/** @experimental Validate and deeply freeze persistable executor identity facts. */
export const declareIdentity = (input: Identity): Identity => {
  const identity = Schema.decodeSync(Identity, { onExcessProperty: "error" })(input)
  const freezeEnforcement = <A extends typeof Enforcement.Type | typeof LimitEnforcement.Type>(value: A): A =>
    Object.freeze(value)
  return Object.freeze({
    ...identity,
    implementation: Object.freeze(identity.implementation),
    runtime: Object.freeze(identity.runtime),
    template: Object.freeze(identity.template),
    network: Object.freeze({ ...identity.network, enforcement: freezeEnforcement(identity.network.enforcement) }),
    limits: Object.freeze({
      deadlineMillis: freezeEnforcement(identity.limits.deadlineMillis),
      cpuMillis: freezeEnforcement(identity.limits.cpuMillis),
      subrequests: freezeEnforcement(identity.limits.subrequests),
      outputBytes: freezeEnforcement(identity.limits.outputBytes),
      filesystem: freezeEnforcement(identity.limits.filesystem),
      processes: freezeEnforcement(identity.limits.processes),
    }),
    knownLimitations: Object.freeze([...identity.knownLimitations]),
  })
}

/** @experimental */
export interface Service {
  readonly identity: Identity
  readonly execute: (request: Request) => Effect.Effect<Result, ExecutionFailure, ProgramCapabilities | Scope.Scope>
}

/** @experimental Host-supplied isolated source executor. */
export class CodeExecutor extends Context.Service<CodeExecutor, Service>()(
  "generalist/core/program/code-executor/CodeExecutor",
) {}

const guaranteeUnavailable = (guarantee: typeof guaranteeName.Type, message: string): SandboxGuaranteeUnavailable =>
  SandboxGuaranteeUnavailable.make({ guarantee, message })

/** @experimental Fail closed before source evaluation when an executor cannot enforce the normalized request. */
export const admit: {
  (request: Request, nowMillis: number): (identity: Identity) => Effect.Effect<void, SandboxGuaranteeUnavailable>
  (identity: Identity, request: Request, nowMillis: number): Effect.Effect<void, SandboxGuaranteeUnavailable>
} = Function.dual(3, (identity: Identity, request: Request, nowMillis: number) => {
  if (identity.physicalIsolation === "trusted-test" || identity.physicalIsolation === "none")
    return Effect.fail(guaranteeUnavailable("physicalIsolation", `executor isolation is ${identity.physicalIsolation}`))
  if (identity.persistence !== "fresh-per-execution")
    return Effect.fail(guaranteeUnavailable("persistence", `executor persistence is ${identity.persistence}`))
  if (identity.network.posture !== "default-deny")
    return Effect.fail(guaranteeUnavailable("network", `executor network posture is ${identity.network.posture}`))

  const guarantees: ReadonlyArray<
    readonly [typeof guaranteeName.Type, typeof Enforcement.Type | typeof LimitEnforcement.Type, number | undefined]
  > = [
    ["network", identity.network.enforcement, undefined],
    ["deadlineMillis", identity.limits.deadlineMillis, Math.max(1, request.deadlineMillis - nowMillis)],
    ["cpuMillis", identity.limits.cpuMillis, request.limits.cpuMillis],
    ["subrequests", identity.limits.subrequests, request.limits.subrequests],
    ["outputBytes", identity.limits.outputBytes, request.limits.outputBytes],
    ["filesystem", identity.limits.filesystem, undefined],
    ["processes", identity.limits.processes, undefined],
  ]
  for (const [name, enforcement, requested] of guarantees) {
    if (enforcement.status === "unenforced") return Effect.fail(guaranteeUnavailable(name, enforcement.reason))
    if ("maximum" in enforcement && enforcement.maximum !== null && requested! > enforcement.maximum)
      return Effect.fail(
        guaranteeUnavailable(name, `requested ${requested} exceeds executor maximum ${enforcement.maximum}`),
      )
  }
  return Effect.void
})

/** @experimental Strictly decode a result and bind every protocol and codec identity field to its request. */
export const validateResult: {
  (value: Schema.Json): (request: Request) => Effect.Effect<Result, SandboxProtocolViolation>
  (request: Request, value: Schema.Json): Effect.Effect<Result, SandboxProtocolViolation>
} = Function.dual(2, (request: Request, value: Schema.Json) =>
  Schema.decodeUnknownEffect(Result, { onExcessProperty: "error" })(value).pipe(
    Effect.mapError(() => SandboxProtocolViolation.make({ message: "invalid result envelope" })),
    Effect.flatMap((result) =>
      result.protocolVersion === request.protocolVersion &&
      result.requestId === request.requestId &&
      result.sourceDigest === request.sourceDigest &&
      result.inputCodec === request.inputCodec &&
      result.outputCodec === request.outputCodec
        ? Effect.succeed(result)
        : Effect.fail(SandboxProtocolViolation.make({ message: "result identity mismatch" })),
    ),
  ),
)

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
export const makeRequest = (input: {
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
export const testIdentity: Identity = declareIdentity({
  provider: "generalist",
  implementation: { name: "generalist/CodeExecutor/test", version: "1" },
  runtime: { name: "host-process", version: "trusted-test" },
  template: { name: "trusted-effect-fixture", version: "1" },
  physicalIsolation: "trusted-test",
  persistence: "trusted-fixture",
  network: {
    posture: "host",
    enforcement: { status: "unenforced", reason: "trusted fixture inherits the host process network" },
  },
  limits: {
    deadlineMillis: { status: "unenforced", reason: "trusted fixture execution is host-owned" },
    cpuMillis: { status: "unenforced", reason: "trusted fixture execution is host-owned" },
    subrequests: { status: "unenforced", reason: "trusted fixture execution is host-owned" },
    outputBytes: { status: "unenforced", reason: "trusted fixture execution is host-owned" },
    filesystem: { status: "unenforced", reason: "trusted fixture inherits the host process filesystem" },
    processes: { status: "unenforced", reason: "trusted fixture inherits the host process" },
  },
  knownLimitations: ["Trusted test fixture only; it provides no source or host isolation."],
})

/** @experimental Trusted fixture executor for tests only. */
export type TestExecute = (
  request: Request,
) => Effect.Effect<unknown, ExecutionFailure, ProgramCapabilities | Scope.Scope>

/** @experimental Trusted fixture executor for tests only. */
export const makeTest = (execute: TestExecute): Service =>
  CodeExecutor.of({
    identity: testIdentity,
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
  })

/** @experimental Trusted fixture Layer for tests only. It provides no source isolation. */
export const layerTest = (execute: TestExecute): Layer.Layer<CodeExecutor> =>
  Layer.succeed(CodeExecutor, makeTest(execute))
