import { ProgramCapabilities, SandboxExecutor } from "tenetkit"
import { Schema } from "effect"

/** @experimental Minimal Worker Loader code contract used by this adapter. */
export interface WorkerCode {
  readonly compatibilityDate: string
  readonly mainModule: string
  readonly modules: Readonly<Record<string, string>>
  readonly globalOutbound: null
  readonly env: Readonly<Record<string, unknown>>
  readonly limits: { readonly cpuMs: number; readonly subrequests: number }
}

/** @experimental Minimal loaded Worker fetch entrypoint. */
export interface Fetcher {
  readonly fetch: (request: Request) => Promise<Response>
}

/** @experimental Minimal Worker Loader stub contract. */
export interface WorkerStub {
  readonly getEntrypoint: () => Fetcher
}

/** @experimental Minimal Worker Loader binding contract. */
export interface WorkerLoader {
  readonly load: (code: WorkerCode) => WorkerStub
}

const identity = {
  protocolVersion: Schema.Literal(SandboxExecutor.protocolVersion),
  requestId: Schema.String,
}
const operation = ProgramCapabilities.ProgramOperationName
const member = Schema.Struct({ member: ProgramCapabilities.ProgramMemberKey, input: Schema.Unknown })

/** @experimental Strict requests accepted by the sole multiplexed capability binding. */
export const CapabilityRpcRequest = Schema.Union([
  Schema.Struct({
    ...identity,
    operation: Schema.Literal("discoverTools"),
    input: Schema.optionalKey(Schema.Undefined),
  }),
  Schema.Struct({ ...identity, operation: Schema.Literal("describeTool"), input: Schema.String }),
  Schema.Struct({
    ...identity,
    operation: Schema.Literal("callTool"),
    input: Schema.Struct({ operation, tool: Schema.String, input: Schema.Unknown }),
  }),
  Schema.Struct({
    ...identity,
    operation: Schema.Literal("callStep"),
    input: Schema.Struct({ operation, step: Schema.String, input: Schema.Unknown }),
  }),
  Schema.Struct({
    ...identity,
    operation: Schema.Literal("runAgent"),
    input: Schema.Struct({ operation, selection: Schema.String, input: Schema.Unknown }),
  }),
  Schema.Struct({
    ...identity,
    operation: Schema.Literal("mapAgents"),
    input: Schema.Struct({ operation, selection: Schema.String, members: Schema.Array(member) }),
  }),
  Schema.Struct({
    ...identity,
    operation: Schema.Literal("fanOutAgents"),
    input: Schema.Struct({
      operation,
      members: Schema.Array(Schema.Struct({ ...member.fields, selection: Schema.String })),
    }),
  }),
  Schema.Struct({
    ...identity,
    operation: Schema.Literal("log"),
    input: Schema.Struct({
      operation,
      level: ProgramCapabilities.LogLevel,
      message: Schema.String,
      data: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
    }),
  }),
])
/** @experimental */
export type CapabilityRpcRequest = typeof CapabilityRpcRequest.Type

/** @experimental Request-scoped capability RPC implementation. */
export interface CapabilityRpc {
  readonly call: (request: CapabilityRpcRequest) => Promise<unknown>
}

/** @experimental Cloudflare Worker Loader adapter construction options. */
export interface Options {
  readonly loader: WorkerLoader
  readonly compatibilityDate: string
  readonly capabilityBinding: (rpc: CapabilityRpc) => unknown
}
