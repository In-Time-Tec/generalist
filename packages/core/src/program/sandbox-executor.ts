import { Context, Effect, Layer, Schema, Scope } from "effect"
import { CapabilityFailure, type ProgramCapabilities } from "./program-capabilities.js"

/** @experimental */
export interface Request {
  readonly language: "javascript"
  readonly source: string
  readonly sourceDigest: string
  readonly input: unknown
  readonly signal: AbortSignal
  readonly limits: {
    readonly wallTimeMillis: number
    readonly outputBytes: number
  }
}

/** @experimental */
export class SandboxUnavailable extends Schema.TaggedErrorClass<SandboxUnavailable>()(
  "@batonfx/core/SandboxUnavailable",
  { language: Schema.Literal("javascript") },
) {}

/** @experimental */
export class SandboxExecutionFailure extends Schema.TaggedErrorClass<SandboxExecutionFailure>()(
  "@batonfx/core/SandboxExecutionFailure",
  { message: Schema.String },
) {}

/** @experimental */
export class SandboxProtocolViolation extends Schema.TaggedErrorClass<SandboxProtocolViolation>()(
  "@batonfx/core/SandboxProtocolViolation",
  { message: Schema.String },
) {}

/** @experimental Typed failures that may cross the sandbox capability protocol. */
export const ExecutionFailure = Schema.Union([
  SandboxUnavailable,
  SandboxExecutionFailure,
  SandboxProtocolViolation,
  CapabilityFailure,
])
/** @experimental */
export type ExecutionFailure = typeof ExecutionFailure.Type

/**
 * @experimental Immutable JSON identity of one executor implementation and its enforced limits. Hosts pin,
 * persist, and compare this value so an admitted Program can only run under the exact executor that admitted it.
 */
export const Identity = Schema.Record(Schema.String, Schema.Json)
/** @experimental */
export type Identity = typeof Identity.Type

/** @experimental */
export interface Interface {
  readonly identity: Identity
  readonly execute: (request: Request) => Effect.Effect<unknown, ExecutionFailure, ProgramCapabilities | Scope.Scope>
}

/** @experimental Host-supplied isolated source executor. Baton does not provide a production implementation. */
export class SandboxExecutor extends Context.Service<SandboxExecutor, Interface>()("@batonfx/core/SandboxExecutor") {}

/** @experimental Identity carried by trusted fixture executors. No production host may claim it. */
export const testIdentity: Identity = Object.freeze({
  language: "javascript",
  implementation: "@batonfx/core/SandboxExecutor/test",
  version: "0",
})

/** @experimental Trusted fixture executor for tests only. */
export const makeTest = (execute: Interface["execute"], identity: Identity = testIdentity): Interface =>
  SandboxExecutor.of({ identity: Object.freeze({ ...identity }), execute })

/** @experimental Trusted fixture Layer for tests only. It provides no source isolation. */
export const layerTest = (execute: Interface["execute"], identity?: Identity): Layer.Layer<SandboxExecutor> =>
  Layer.succeed(SandboxExecutor, makeTest(execute, identity))
