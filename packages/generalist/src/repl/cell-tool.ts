import { Effect, Layer, Schema, Stream } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import type { ToolSchedulingPolicy } from "../core/agent/service.js"
import { type Progress, type Service, ToolContext } from "../core/tools/tool-context.js"
import {
  FrameworkFailure,
  type FrameworkStage,
  type Outcome,
  type Request,
  ToolExecutor,
  layerRouter,
  route as toolExecutorRoute,
} from "../core/tools/tool-executor.js"
import type { Route } from "../core/tools/tool-placement.js"
import { CellEvent, CellFailure, CellResult, KernelProtocolViolation, KernelUnavailable } from "./cell.js"
import { ExecutionFailed, LimitExceeded, type SandboxError, SandboxProvider } from "../sandbox/index.js"

/** @experimental The only name a Generalist REPL host advertises to a model. */
export const name = "typescript"

/** @experimental Maximum authored source accepted in one cell. */
export const maxSourceBytes = 65_536

/** @experimental The cell source parameter. */
export const Parameters = Schema.Struct({
  code: Schema.String.check(Schema.isMaxLength(maxSourceBytes)),
})
/** @experimental */
export type Parameters = typeof Parameters.Type

const description = [
  "Run TypeScript in the session's persistent Bun kernel.",
  "Declarations, imports, and values from previous cells are still in scope.",
  "Top-level await is available; a thrown error is an observation, not a run failure.",
].join(" ")

/** @experimental The one Effect AI tool a conversational Generalist agent advertises. */
export const tool = Tool.make(name, {
  description,
  parameters: Parameters,
  success: CellResult,
  failure: CellFailure,
  failureMode: "return",
})

/** @experimental */
export const toolkit = Toolkit.make(tool)

/**
 * @experimental One shared namespace means one cell at a time: the cell tool is never parallel-safe
 * and every call is an authored-order exclusive barrier.
 */
export const scheduling: ToolSchedulingPolicy = {
  maxConcurrency: 1,
  parallelSafe: [],
}

const frameworkFailure = (stage: FrameworkStage, message: string): FrameworkFailure =>
  FrameworkFailure.make({ stage, tool: name, message })

const schemaMessage = (error: { readonly message: string }): string => error.message

/** @experimental Largest encoded cell event carried in one progress record. */
export const maxProgressBytes = 16_384

const encodeEvent = Schema.encodeUnknownEffect(CellEvent)

const identity = (event: CellEvent) => ({
  _tag: event._tag,
  cellId: event.cellId,
  sequence: event.sequence,
})

const encodedSize = (encoded: typeof CellEvent.Encoded): number =>
  new TextEncoder().encode(JSON.stringify(encoded)).byteLength

/**
 * @experimental One progress record per cell event, carrying the whole encoded event so a host can
 * render streamed cell output. An event that cannot be encoded, or that exceeds the bound, still
 * emits its identity, so the cell-local sequence a consumer verifies stays contiguous.
 */
const progress = (toolCallId: string, event: CellEvent): Effect.Effect<Progress> =>
  encodeEvent(event).pipe(
    Effect.match({
      onFailure: () => identity(event),
      onSuccess: (encoded) => {
        const bytes = encodedSize(encoded)
        return bytes > maxProgressBytes ? { ...identity(event), withheldBytes: bytes } : encoded
      },
    }),
    Effect.map((data) => ({ toolCallId, message: event._tag, data })),
  )

const cellIdOf = (request: Request, context: Service): string =>
  context.operationKey ?? context.toolCallId ?? `${request.sessionId}-${request.turn}-${request.toolCallIndex}`

const success = (result: CellResult): Effect.Effect<Outcome, FrameworkFailure> =>
  Schema.encodeUnknownEffect(CellResult)(result).pipe(
    Effect.mapError((error) => frameworkFailure("encode-success", schemaMessage(error))),
    Effect.map((encodedResult): Outcome => ({ _tag: "Success", result, encodedResult })),
  )

const domainFailure = (failure: CellFailure): Effect.Effect<Outcome, FrameworkFailure> =>
  Schema.encodeUnknownEffect(CellFailure)(failure).pipe(
    Effect.mapError((error) => frameworkFailure("encode-domain-failure", schemaMessage(error))),
    Effect.map((encodedFailure): Outcome => ({ _tag: "DomainFailure", failure, encodedFailure })),
  )

const sandboxFailure = (sessionId: string, cellId: string, failure: SandboxError): CellFailure => {
  if (Schema.is(ExecutionFailed)(failure) && Schema.is(CellFailure)(failure.cause)) return failure.cause
  if (Schema.is(LimitExceeded)(failure)) {
    return KernelUnavailable.make({
      sessionId,
      reason: failure.resource === "wall-clock" ? "deadline-exceeded" : "profile-mismatch",
      message: `sandbox ${failure.resource} limit ${failure.limit} exceeded`,
    })
  }
  if (failure._tag === "generalist/sandbox/Unavailable" || failure._tag === "generalist/sandbox/Unsupported") {
    return KernelUnavailable.make({ sessionId, reason: "start-failed", message: failure.message })
  }
  return KernelProtocolViolation.make({ sessionId, cellId, message: failure.message })
}

const decodeEvent = (sessionId: string, cellId: string, value: unknown) =>
  Schema.decodeUnknownEffect(CellEvent)(value).pipe(
    Effect.mapError(() =>
      KernelProtocolViolation.make({ sessionId, cellId, message: "sandbox emitted an invalid cell event" }),
    ),
  )

const decodeResult = (sessionId: string, cellId: string, value: unknown) =>
  Schema.decodeUnknownEffect(CellResult)(value).pipe(
    Effect.mapError(() =>
      KernelProtocolViolation.make({ sessionId, cellId, message: "sandbox returned an invalid cell result" }),
    ),
  )

const execute = (request: Request): Effect.Effect<Outcome, FrameworkFailure, ToolContext | SandboxProvider> =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = yield* ToolContext
      const provider = yield* SandboxProvider
      const params = yield* Schema.decodeUnknownEffect(Parameters)(request.call.params).pipe(
        Effect.mapError((error) => frameworkFailure("decode-input", schemaMessage(error))),
      )
      const toolCallId = context.toolCallId ?? request.call.id
      const cellId = cellIdOf(request, context)
      return yield* Effect.gen(function* () {
        const sandbox = yield* provider
          .acquire({ key: request.sessionId })
          .pipe(Effect.mapError((failure) => sandboxFailure(request.sessionId, cellId, failure)))
        const execution = yield* sandbox
          .start({ _tag: "TypeScript", cellId, source: params.code })
          .pipe(Effect.mapError((failure) => sandboxFailure(request.sessionId, cellId, failure)))
        yield* execution.events.pipe(
          Stream.filter((event) => event._tag === "Metadata"),
          Stream.mapEffect((event) => decodeEvent(request.sessionId, cellId, event.value)),
          Stream.runForEach((event) => progress(toolCallId, event).pipe(Effect.flatMap(context.emit))),
          Effect.mapError((failure) =>
            Schema.is(CellFailure)(failure) ? failure : sandboxFailure(request.sessionId, cellId, failure),
          ),
        )
        const result = yield* execution.result.pipe(
          Effect.mapError((failure) => sandboxFailure(request.sessionId, cellId, failure)),
        )
        const cell = yield* decodeResult(request.sessionId, cellId, result.value)
        if (sandbox.capabilities.snapshot) {
          const snapshotId = yield* sandbox.snapshot.pipe(
            Effect.mapError((failure) => sandboxFailure(request.sessionId, cellId, failure)),
          )
          yield* context.emit({
            toolCallId,
            message: "SandboxSnapshot",
            data: { _tag: "SandboxSnapshot", snapshotId },
          })
        }
        return cell
      }).pipe(Effect.matchEffect({ onSuccess: success, onFailure: domainFailure }))
    }),
  )

/** @experimental The cell route: one tool, ToolContext progress and interruption, typed cell outcomes. */
export const route: Route<ToolContext | SandboxProvider> = toolExecutorRoute<ToolContext | SandboxProvider>({
  tools: [name],
  execute,
})

const executeRouted = (request: Request): ReturnType<typeof execute> =>
  route.matches(request)
    ? execute(request)
    : Effect.fail(
        FrameworkFailure.make({
          stage: "route",
          tool: request.call.name,
          message: `Tool ${request.call.name} has no matching route`,
        }),
      )

/** @experimental */
export const layer: Layer.Layer<ToolExecutor, never, SandboxProvider> = Layer.effect(
  ToolExecutor,
  Effect.map(SandboxProvider, (provider) =>
    ToolExecutor.of({
      execute: (request) => executeRouted(request).pipe(Effect.provideService(SandboxProvider, provider)),
    }),
  ),
)
