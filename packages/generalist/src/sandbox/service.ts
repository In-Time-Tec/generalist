import { Context, Duration, Effect, FileSystem, Schema, Scope, Stream } from "effect"
import type { Service as ProgramCapabilitiesService } from "../core/program/capabilities.js"
import type { Request as CodeExecutorRequest } from "../core/program/code-executor.js"

const PositiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
const Identifier = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(4_096))

/** Durable provider identity for one immutable sandbox image. */
export const SnapshotId = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(4_096))
export type SnapshotId = typeof SnapshotId.Type

/** Factual physical boundary. It is not a security rating. */
export const Isolation = Schema.Literals(["process", "v8-isolate", "container", "microvm"])
export type Isolation = typeof Isolation.Type

/** Limits requested from and enforced by a sandbox provider. */
export const Limits = Schema.Struct({
  cpuMs: Schema.optionalKey(PositiveInt),
  memoryMb: Schema.optionalKey(PositiveInt),
  wallClock: Schema.optionalKey(Schema.DurationFromMillis),
})
export type Limits = typeof Limits.Type

/** A normal process invocation for providers that expose an operating-system command boundary. */
export const ProcessCommand = Schema.TaggedStruct("Process", {
  command: Identifier,
  arguments: Schema.Array(Schema.String),
  cwd: Schema.optionalKey(Schema.String),
  environment: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  stdin: Schema.optionalKey(Schema.String),
})
export type ProcessCommand = typeof ProcessCommand.Type

/** One stateful TypeScript cell evaluated in a sandbox-owned namespace. */
export const TypeScriptCommand = Schema.TaggedStruct("TypeScript", {
  cellId: Identifier,
  source: Schema.String,
})
export type TypeScriptCommand = typeof TypeScriptCommand.Type

/**
 * Exact JavaScript module invocation used by the Worker Loader leaf. The capability
 * service is process-local authority and is deliberately not serializable.
 */
export interface JavaScriptModuleCommand {
  readonly _tag: "JavaScriptModule"
  readonly request: CodeExecutorRequest
  readonly capabilities: ProgramCapabilitiesService
}

/**
 * Closed command vocabulary implemented by current leaves. A provider returns
 * Unsupported for command kinds it does not implement rather than interpreting another kind.
 */
export type Command = ProcessCommand | TypeScriptCommand | JavaScriptModuleCommand

/** One streaming write from a sandbox command. */
export const Output = Schema.TaggedStruct("Output", {
  channel: Schema.Literals(["stdout", "stderr"]),
  text: Schema.String,
})
export type Output = typeof Output.Type

/** Provider-specific structured progress retained for a typed adapter. */
export const Metadata = Schema.TaggedStruct("Metadata", { value: Schema.Unknown })
export type Metadata = typeof Metadata.Type

/** One ordered command event. */
export const ExecEvent = Schema.Union([Output, Metadata])
export type ExecEvent = typeof ExecEvent.Type

/** Collected terminal command result. */
export const ExecResult = Schema.Struct({
  stdout: Schema.String,
  stderr: Schema.String,
  exitCode: Schema.Int,
  value: Schema.optionalKey(Schema.Unknown),
})
export type ExecResult = typeof ExecResult.Type

/** Sandbox operation that a leaf may report as unsupported. */
export const Operation = Schema.Literals([
  "exec:process",
  "exec:typescript",
  "exec:javascript-module",
  "files",
  "pause",
  "resume",
  "snapshot",
  "fork",
  "limit:cpu",
  "limit:memory",
  "limit:wall-clock",
])
export type Operation = typeof Operation.Type

/** The leaf does not implement the requested capability. */
export class Unsupported extends Schema.TaggedError<Unsupported>()("generalist/sandbox/Unsupported", {
  operation: Operation,
  message: Schema.String,
}) {}

/** The provider could not acquire or reach the sandbox. */
export class Unavailable extends Schema.TaggedError<Unavailable>()("generalist/sandbox/Unavailable", {
  message: Schema.String,
}) {}

/** The command failed after being admitted by the sandbox. */
export class ExecutionFailed extends Schema.TaggedError<ExecutionFailed>()("generalist/sandbox/ExecutionFailed", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Unknown),
}) {}

/** A sandbox stopped work at an enforced resource limit. */
export class LimitExceeded extends Schema.TaggedError<LimitExceeded>()("generalist/sandbox/LimitExceeded", {
  resource: Schema.Literals(["cpu", "memory", "wall-clock"]),
  limit: PositiveInt,
}) {}

/** An immutable sandbox image is unavailable to this provider. */
export class SnapshotNotFound extends Schema.TaggedError<SnapshotNotFound>()("generalist/sandbox/SnapshotNotFound", {
  snapshotId: SnapshotId,
}) {}

/** Closed failure union for the provider-neutral sandbox boundary. */
export const SandboxError = Schema.Union([Unsupported, Unavailable, ExecutionFailed, LimitExceeded, SnapshotNotFound])
export type SandboxError = typeof SandboxError.Type

/** Command, lifecycle, and limit capabilities declared by one acquired sandbox. */
export interface Capabilities {
  readonly commands: ReadonlyArray<Command["_tag"]>
  readonly files: boolean
  readonly pause: boolean
  readonly resume: boolean
  readonly snapshot: boolean
  readonly fork: boolean
  readonly limits: ReadonlyArray<"cpu" | "memory" | "wall-clock">
}

/** One command in flight. The caller's Scope owns its resources. */
export interface Execution {
  readonly events: Stream.Stream<ExecEvent, SandboxError>
  readonly result: Effect.Effect<ExecResult, SandboxError>
}

/** One acquired sandbox and its factual capabilities. */
export interface SandboxService {
  readonly isolation: Isolation
  readonly limits: Limits
  readonly capabilities: Capabilities
  readonly start: (command: Command) => Effect.Effect<Execution, SandboxError, Scope.Scope>
  readonly exec: (command: Command) => Effect.Effect<ExecResult, SandboxError>
  readonly stream: (command: Command) => Stream.Stream<ExecEvent, SandboxError>
  readonly files: Effect.Effect<FileSystem.FileSystem, Unsupported>
  readonly pause: Effect.Effect<void, SandboxError>
  readonly resume: Effect.Effect<void, SandboxError>
  readonly snapshot: Effect.Effect<SnapshotId, SandboxError>
  readonly fork: (snapshotId: SnapshotId) => Effect.Effect<SandboxService, SandboxError>
}

/** Acquired sandbox service tag. */
export class Sandbox extends Context.Service<Sandbox, SandboxService>()("generalist/sandbox/service/Sandbox") {}

/** Construct collected and streaming variants from one scoped command start operation. */
export const make = (input: Omit<SandboxService, "exec" | "stream">): SandboxService =>
  Sandbox.of({
    ...input,
    exec: (command) => Effect.scoped(input.start(command).pipe(Effect.flatMap((execution) => execution.result))),
    stream: (command) => Stream.unwrap(input.start(command).pipe(Effect.map((execution) => execution.events))),
  })

/** One provider acquisition request. A key asks a stateful provider for the same logical sandbox. */
export interface AcquireOptions {
  readonly image?: string
  readonly key?: string
  readonly limits?: Limits
}

/** Provider that acquires sandboxes under the caller's Scope. */
export interface SandboxProviderService {
  readonly defaultImage: string
  readonly acquire: (options?: AcquireOptions) => Effect.Effect<SandboxService, SandboxError, Scope.Scope>
}

/** Sandbox provider service tag. */
export class SandboxProvider extends Context.Service<SandboxProvider, SandboxProviderService>()(
  "generalist/sandbox/service/SandboxProvider",
) {}

/** Normalize a configured wall-clock duration to milliseconds. */
export const wallClockMillis = (limits: Limits): number | undefined =>
  limits.wallClock === undefined ? undefined : Duration.toMillis(limits.wallClock)
