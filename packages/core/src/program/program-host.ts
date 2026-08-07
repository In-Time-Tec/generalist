import { Context, Effect, Function, Layer, Ref, Schema, SchemaRepresentation, Scope, Semaphore } from "effect"
import { digest } from "../durable/canonical-json.js"
import { make as makeProgramManifest, type PinnedProgram, type ProgramBudget } from "../durable/program-manifest.js"
import type { Bindings, Invocation } from "./program-bindings.js"
import {
  type AgentFanOutInput,
  type AgentMapInput,
  type AgentMemberResult,
  type AgentRunInput,
  type AgentRunResult,
  type CapabilityFailure,
  type Interface as Capabilities,
  type LogInput,
  LogLevel,
  ProgramAgentFailure,
  ProgramAuthorizationFailure,
  ProgramBudgetExhausted,
  ProgramCancelled,
  ProgramCapabilities,
  ProgramCapabilityDenied,
  ProgramCapabilityMissing,
  ProgramMemberKey,
  ProgramOperationName,
  ProgramReplayDivergence,
  ProgramSchemaFailure,
  ProgramStepFailure,
  ProgramSuspended,
  ProgramToolFailure,
  type StepCallInput,
  type ToolCallInput,
  type ToolSummary,
} from "./program-capabilities.js"
import { ExecutionFailure as SandboxFailure, type Interface as Sandbox } from "./sandbox-executor.js"

const ToolCall = Schema.Struct({ operation: ProgramOperationName, tool: Schema.String, input: Schema.Unknown })
const StepCall = Schema.Struct({ operation: ProgramOperationName, step: Schema.String, input: Schema.Unknown })
const AgentRun = Schema.Struct({ operation: ProgramOperationName, selection: Schema.String, input: Schema.Unknown })
const MapMember = Schema.Struct({ member: ProgramMemberKey, input: Schema.Unknown })
const AgentMap = Schema.Struct({
  operation: ProgramOperationName,
  selection: Schema.String,
  members: Schema.Array(MapMember),
})
const AgentFanOut = Schema.Struct({
  operation: ProgramOperationName,
  members: Schema.Array(Schema.Struct({ member: ProgramMemberKey, selection: Schema.String, input: Schema.Unknown })),
})
const Log = Schema.Struct({
  operation: ProgramOperationName,
  level: LogLevel,
  message: Schema.String,
  data: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
})
const AgentResult = Schema.Struct({
  text: Schema.String,
  turns: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  tokenUsage: Schema.Struct({
    input: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    output: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
})

/** @experimental */
export class ProgramBindingMismatch extends Schema.TaggedErrorClass<ProgramBindingMismatch>()(
  "@batonfx/core/ProgramBindingMismatch",
  { kind: Schema.Literals(["tool", "step", "agent"]), name: Schema.String, reason: Schema.String },
) {}

/** @experimental */
export class ProgramIdentityMismatch extends Schema.TaggedErrorClass<ProgramIdentityMismatch>()(
  "@batonfx/core/ProgramIdentityMismatch",
  { expected: Schema.String, actual: Schema.String },
) {}

/** @experimental Failures returned by Core-owned Program execution. */
export const ExecutionFailure = Schema.Union([SandboxFailure, ProgramBindingMismatch, ProgramIdentityMismatch])
/** @experimental */
export type ExecutionFailure = typeof ExecutionFailure.Type

/** @experimental Encoded execution request used by direct and durable hosts. */
export interface Request {
  readonly program: PinnedProgram
  readonly input: unknown
}

/** @experimental */
export interface Interface {
  readonly execute: (request: Request) => Effect.Effect<unknown, ExecutionFailure, Scope.Scope>
}

/** @experimental Owner of Agent Program execution and its host policy. */
export class ProgramHost extends Context.Service<ProgramHost, Interface>()(
  "@batonfx/core/program/program-host/ProgramHost",
) {}

const encodedBytes = (value: unknown): Effect.Effect<number, ProgramSchemaFailure> =>
  Schema.encodeEffect(Schema.UnknownFromJsonString)(value).pipe(
    Effect.map((encoded) => new TextEncoder().encode(encoded).byteLength),
    Effect.mapError((error) => ProgramSchemaFailure.make({ boundary: "program-output", message: error.message })),
  )

const schemaFailure =
  (boundary: ProgramSchemaFailure["boundary"], capability: string | undefined) =>
  (error: Schema.SchemaError): ProgramSchemaFailure =>
    ProgramSchemaFailure.make({ boundary, ...(capability === undefined ? {} : { capability }), message: String(error) })

const exactClosure: {
  (bindings: Bindings): (program: PinnedProgram) => Effect.Effect<void, ProgramBindingMismatch>
  (program: PinnedProgram, bindings: Bindings): Effect.Effect<void, ProgramBindingMismatch>
} = Function.dual(
  2,
  (program: PinnedProgram, bindings: Bindings): Effect.Effect<void, ProgramBindingMismatch> =>
    Effect.gen(function* () {
      const check = (
        kind: "tool" | "step" | "agent",
        expectedByName: ReadonlyMap<string, string>,
        actualByName: ReadonlyMap<string, string>,
      ): Effect.Effect<void, ProgramBindingMismatch> =>
        Effect.gen(function* () {
          for (const [name, pin] of expectedByName) {
            const bound = actualByName.get(name)
            if (bound === undefined)
              return yield* ProgramBindingMismatch.make({ kind, name, reason: "declared capability is not bound" })
            if (bound !== pin)
              return yield* ProgramBindingMismatch.make({ kind, name, reason: "binding pin does not match" })
          }
          for (const name of actualByName.keys()) {
            if (!expectedByName.has(name))
              return yield* ProgramBindingMismatch.make({
                kind,
                name,
                reason: "binding is outside the manifest closure",
              })
          }
        })
      yield* check(
        "tool",
        new Map(program.manifest.capabilities.tools.map((entry) => [entry.name, entry.pin])),
        new Map(bindings.tools.map((entry) => [entry.name, entry.pin])),
      )
      yield* check(
        "step",
        new Map(program.manifest.capabilities.steps.map((entry) => [entry.name, entry.pin])),
        new Map(bindings.steps.map((entry) => [entry.name, entry.pin])),
      )
      yield* check(
        "agent",
        new Map(
          program.manifest.capabilities.agents.map((entry) => [entry.selection, `${entry.agent}\0${entry.input}`]),
        ),
        new Map(bindings.agents.map((entry) => [entry.selection, `${entry.agent}\0${entry.inputPin}`])),
      )
    }),
)

/** @experimental Verify that live Program bindings exactly match persisted manifest authority. */
export const validateBindings = exactClosure

interface State {
  readonly toolCalls: number
  readonly agentRuns: number
  readonly tokens: number
  readonly logBytes: number
  readonly operations: ReadonlyMap<string, string>
}

const makeCapabilities = (bindings: Bindings, budget: ProgramBudget) =>
  Effect.gen(function* () {
    const state = yield* Ref.make<State>({ toolCalls: 0, agentRuns: 0, tokens: 0, logBytes: 0, operations: new Map() })
    const semaphore = yield* Semaphore.make(budget.concurrency)
    const tools = new Map(bindings.tools.map((binding) => [binding.name, binding] as const))
    const steps = new Map(bindings.steps.map((binding) => [binding.name, binding] as const))
    const agents = new Map(bindings.agents.map((binding) => [binding.selection, binding] as const))
    const describeSchema = (schema: Schema.Top) =>
      Schema.encodeSync(SchemaRepresentation.DocumentFromJson)(SchemaRepresentation.fromAST(schema.ast))
    const discoverTools: Effect.Effect<ReadonlyArray<ToolSummary>> = Effect.succeed(
      bindings.tools.map((binding) => ({ name: binding.name })),
    )
    const describeTool = (name: string) => {
      const binding = tools.get(name)
      return binding === undefined
        ? Effect.fail(ProgramCapabilityMissing.make({ capability: name }))
        : Effect.succeed({
            name,
            inputSchema: describeSchema(binding.input),
            outputSchema: describeSchema(binding.output),
          })
    }

    const reserveOperation = (operation: string, identity: unknown) =>
      Ref.modify(state, (current) => {
        const actual = digest(identity)
        const expected = current.operations.get(operation)
        if (expected !== undefined)
          return [ProgramReplayDivergence.make({ operation, expected, actual }), current] as const
        const operations = new Map(current.operations)
        operations.set(operation, actual)
        return [undefined, { ...current, operations }] as const
      }).pipe(Effect.flatMap((failure) => (failure === undefined ? Effect.void : Effect.fail(failure))))

    const reserve = (dimension: "toolCalls" | "agentRuns" | "tokens" | "logBytes", amount: number) =>
      Ref.modify(state, (current) => {
        const next = current[dimension] + amount
        return next > budget[dimension]
          ? ([false, current] as const)
          : ([true, { ...current, [dimension]: next }] as const)
      }).pipe(
        Effect.flatMap((allowed) =>
          allowed ? Effect.void : Effect.fail(ProgramBudgetExhausted.make({ dimension, limit: budget[dimension] })),
        ),
      )

    const authorize = (
      invocation: Pick<Invocation, "authorize">,
      operation: string,
      capability: string,
    ): Effect.Effect<void, ProgramAuthorizationFailure | ProgramCapabilityDenied | ProgramSuspended> =>
      invocation.authorize(operation).pipe(
        Effect.flatMap((allowed) =>
          allowed
            ? Effect.void
            : Effect.fail(
                ProgramCapabilityDenied.make({
                  capability,
                  operation,
                  reason: "host authorization denied the operation",
                }),
              ),
        ),
      )

    const executeAgent = (
      operation: string,
      selection: string,
      encoded: unknown,
    ): Effect.Effect<AgentRunResult, CapabilityFailure> =>
      Effect.gen(function* () {
        const binding = agents.get(selection)
        if (binding === undefined) return yield* ProgramCapabilityMissing.make({ capability: selection })
        const invocation = yield* binding.decode(encoded).pipe(Effect.mapError(schemaFailure("agent-input", selection)))
        yield* authorize(invocation, operation, selection)
        const raw = yield* semaphore
          .withPermits(1)(invocation.execute)
          .pipe(
            Effect.catch(
              (cause): Effect.Effect<never, ProgramSuspended | ProgramCancelled | ProgramAgentFailure> =>
                Schema.is(ProgramSuspended)(cause) || Schema.is(ProgramCancelled)(cause)
                  ? Effect.fail(cause)
                  : Effect.fail(ProgramAgentFailure.make({ selection, operation, cause })),
            ),
          )
        const result = yield* Schema.decodeUnknownEffect(AgentResult, { onExcessProperty: "error" })(raw).pipe(
          Effect.mapError(schemaFailure("agent-output", selection)),
        )
        yield* reserve("tokens", result.tokenUsage.input + result.tokenUsage.output)
        return result
      })

    const callTool = (raw: ToolCallInput) =>
      Effect.gen(function* () {
        const input = yield* Schema.decodeUnknownEffect(ToolCall, { onExcessProperty: "error" })(raw).pipe(
          Effect.mapError(schemaFailure("tool-input", undefined)),
        )
        yield* reserveOperation(input.operation, { kind: "tool", name: input.tool, input: input.input })
        yield* reserve("toolCalls", 1)
        const binding = tools.get(input.tool)
        if (binding === undefined) return yield* ProgramCapabilityMissing.make({ capability: input.tool })
        const invocation = yield* binding
          .decode(input.input)
          .pipe(Effect.mapError(schemaFailure("tool-input", input.tool)))
        yield* authorize(invocation, input.operation, input.tool)
        const output = yield* semaphore
          .withPermits(1)(invocation.execute)
          .pipe(
            Effect.catch(
              (cause): Effect.Effect<never, ProgramSuspended | ProgramCancelled | ProgramToolFailure> =>
                Schema.is(ProgramSuspended)(cause) || Schema.is(ProgramCancelled)(cause)
                  ? Effect.fail(cause)
                  : Effect.fail(ProgramToolFailure.make({ tool: input.tool, operation: input.operation, cause })),
            ),
          )
        return yield* Schema.encodeEffect(binding.output)(output).pipe(
          Effect.mapError(schemaFailure("tool-output", input.tool)),
        )
      })

    const callStep = (raw: StepCallInput) =>
      Effect.gen(function* () {
        const input = yield* Schema.decodeUnknownEffect(StepCall, { onExcessProperty: "error" })(raw).pipe(
          Effect.mapError(schemaFailure("step-input", undefined)),
        )
        yield* reserveOperation(input.operation, { kind: "step", name: input.step, input: input.input })
        const binding = steps.get(input.step)
        if (binding === undefined) return yield* ProgramCapabilityMissing.make({ capability: input.step })
        const invocation = yield* binding
          .decode(input.input)
          .pipe(Effect.mapError(schemaFailure("step-input", input.step)))
        yield* authorize(invocation, input.operation, input.step)
        const output = yield* semaphore
          .withPermits(1)(invocation.execute)
          .pipe(
            Effect.catch(
              (cause): Effect.Effect<never, ProgramSuspended | ProgramCancelled | ProgramStepFailure> =>
                Schema.is(ProgramSuspended)(cause) || Schema.is(ProgramCancelled)(cause)
                  ? Effect.fail(cause)
                  : Effect.fail(ProgramStepFailure.make({ step: input.step, operation: input.operation, cause })),
            ),
          )
        return yield* Schema.encodeEffect(binding.output)(output).pipe(
          Effect.mapError(schemaFailure("step-output", input.step)),
        )
      })

    const runAgent = (raw: AgentRunInput) =>
      Effect.gen(function* () {
        const input = yield* Schema.decodeUnknownEffect(AgentRun, { onExcessProperty: "error" })(raw).pipe(
          Effect.mapError(schemaFailure("agent-input", undefined)),
        )
        yield* reserveOperation(input.operation, { kind: "agent", selection: input.selection, input: input.input })
        yield* reserve("agentRuns", 1)
        return yield* executeAgent(input.operation, input.selection, input.input)
      })

    const orderedMembers = <A extends { readonly member: string }>(operation: string, members: ReadonlyArray<A>) => {
      const sorted = [...members].toSorted((left, right) => left.member.localeCompare(right.member))
      return sorted.some((member, index) => index > 0 && sorted[index - 1]!.member === member.member)
        ? Effect.fail(
            ProgramReplayDivergence.make({ operation, expected: "unique member keys", actual: "duplicate member key" }),
          )
        : Effect.succeed(sorted)
    }

    const mapAgents = (raw: AgentMapInput) =>
      Effect.gen(function* () {
        const input = yield* Schema.decodeUnknownEffect(AgentMap, { onExcessProperty: "error" })(raw).pipe(
          Effect.mapError(schemaFailure("agent-input", undefined)),
        )
        yield* reserveOperation(input.operation, {
          kind: "agent-map",
          selection: input.selection,
          members: input.members,
        })
        const members = yield* orderedMembers(input.operation, input.members)
        yield* reserve("agentRuns", members.length)
        return yield* Effect.forEach(
          members,
          (member): Effect.Effect<AgentMemberResult, CapabilityFailure> =>
            executeAgent(input.operation, input.selection, member.input).pipe(
              Effect.map((result) => ({ member: member.member, result })),
            ),
          { concurrency: "unbounded" },
        )
      })

    const fanOutAgents = (raw: AgentFanOutInput) =>
      Effect.gen(function* () {
        const input = yield* Schema.decodeUnknownEffect(AgentFanOut, { onExcessProperty: "error" })(raw).pipe(
          Effect.mapError(schemaFailure("agent-input", undefined)),
        )
        yield* reserveOperation(input.operation, { kind: "agent-fan-out", members: input.members })
        const members = yield* orderedMembers(input.operation, input.members)
        yield* reserve("agentRuns", members.length)
        return yield* Effect.forEach(
          members,
          (member): Effect.Effect<AgentMemberResult, CapabilityFailure> =>
            executeAgent(input.operation, member.selection, member.input).pipe(
              Effect.map((result) => ({ member: member.member, result })),
            ),
          { concurrency: "unbounded" },
        )
      })

    const log = (raw: LogInput) =>
      Effect.gen(function* () {
        const input = yield* Schema.decodeUnknownEffect(Log, { onExcessProperty: "error" })(raw).pipe(
          Effect.mapError(schemaFailure("program-output", undefined)),
        )
        yield* reserveOperation(input.operation, { kind: "log", ...input })
        const bytes = yield* encodedBytes({ level: input.level, message: input.message, data: input.data })
        yield* reserve("logBytes", bytes)
      })

    return ProgramCapabilities.of({
      discoverTools,
      describeTool,
      callTool,
      callStep,
      runAgent,
      mapAgents,
      fanOutAgents,
      log,
    } satisfies Capabilities)
  })

/** @experimental Direct process-local host for an explicitly supplied sandbox and live bindings. */
export const layerDirect = (options: {
  readonly sandbox: Sandbox
  readonly bindings: Bindings
}): Layer.Layer<ProgramHost> =>
  Layer.succeed(
    ProgramHost,
    ProgramHost.of({
      execute: (request) =>
        Effect.gen(function* () {
          const actualPin = makeProgramManifest(request.program.manifest).pin
          if (actualPin !== request.program.pin)
            return yield* ProgramIdentityMismatch.make({ expected: request.program.pin, actual: actualPin })
          yield* validateBindings(request.program, options.bindings)
          const capabilities = yield* makeCapabilities(options.bindings, request.program.manifest.budget)
          const controller = new AbortController()
          const execution = options.sandbox
            .execute({
              language: "javascript",
              source: request.program.manifest.source.text,
              sourceDigest: digest(request.program.manifest.source.text),
              input: request.input,
              signal: controller.signal,
              limits: {
                wallTimeMillis: request.program.manifest.budget.wallClockMillis,
                outputBytes: request.program.manifest.budget.outputBytes,
              },
            })
            .pipe(Effect.provideService(ProgramCapabilities, capabilities))
          const output = yield* execution.pipe(
            Effect.timeoutOrElse({
              duration: request.program.manifest.budget.wallClockMillis,
              orElse: () =>
                Effect.fail(
                  ProgramBudgetExhausted.make({
                    dimension: "wallClockMillis",
                    limit: request.program.manifest.budget.wallClockMillis,
                  }),
                ),
            }),
            Effect.onInterrupt(() => Effect.sync(() => controller.abort())),
          )
          const bytes = yield* encodedBytes(output)
          if (bytes > request.program.manifest.budget.outputBytes)
            return yield* ProgramBudgetExhausted.make({
              dimension: "outputBytes",
              limit: request.program.manifest.budget.outputBytes,
            })
          return output
        }),
    }),
  )
