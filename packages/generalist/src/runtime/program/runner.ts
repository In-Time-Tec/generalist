import { make as makeAgentMembers } from "./agent-members.js"
import { Clock, DateTime, Effect, Schema, SchemaRepresentation } from "effect"
import { type Service as CodeExecutorService, makeRequest } from "../../core/program/code-executor.js"
import {
  type CapabilityFailure,
  ProgramBudgetExhausted,
  ProgramCancelled,
  ProgramCapabilities,
  ProgramCapabilityMissing,
  ProgramInvocationFailure,
  ProgramOperationUnknown,
  type ProgramSchemaFailure,
  ProgramStepFailure,
  ProgramSuspended,
  ProgramToolFailure,
} from "../../core/program/capabilities.js"
import type { Handlers, ProgramReplayPolicy } from "../../core/program/handlers.js"
import { type PinnedProgram, make as makeProgramManifest } from "../../core/durable/manifest/program-manifest.js"
import {
  ProgramIdentityMismatch,
  ProgramRunner,
  type Service as ProgramRunnerService,
  validateHandlers,
} from "../../core/program/runner.js"
import type { ExecutionClaim, ExecutionRecord, Service as RunStore } from "../run/store.js"
import type { CommitProgramLogInput, ProgramOperationKind, ProgramReservation } from "./store.js"
import {
  AgentFanOut,
  AgentMap,
  AgentRun,
  Log,
  StepCall,
  ToolCall,
  digest,
  encodedBytes,
  failureFromExit,
  schemaFailure,
  type SerializedValue,
  storeFailure,
  strictDecode,
} from "./boundary.js"
import { programWait } from "./approval.js"
import { OperationOutcome } from "./operation-outcome.js"
import { Authorization } from "./authorization.js"
import { digest as identityDigest } from "../../core/durable/canonical-json.js"
import type { Any as AnyAgent } from "../../core/agent/lifecycle/definition.js"
import type { ChildCapabilities } from "../execution/scope.js"
export const make = (input: {
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly store: RunStore
  readonly executor: CodeExecutorService
  readonly handlers: Handlers
  readonly children?: ChildCapabilities<Readonly<Record<string, AnyAgent>>>
}): ProgramRunnerService => {
  const tools = new Map(input.handlers.tools.map((handler) => [handler.name, handler] as const))
  const steps = new Map(input.handlers.steps.map((handler) => [handler.name, handler] as const))
  const branch =
    input.claimed.checkpoint !== undefined &&
    "_tag" in input.claimed.checkpoint &&
    input.claimed.checkpoint._tag === "Program"
      ? input.claimed.checkpoint.branch
      : undefined
  const operationIdentity = (authoredOperation: string): string =>
    branch === undefined
      ? authoredOperation
      : ((Object.hasOwn(branch.replay, authoredOperation) ? branch.replay[authoredOperation] : undefined) ??
        `b${identityDigest({ namespace: branch.namespace, authoredOperation }).slice(0, 63)}`)
  // Immutable command receipts are not the current dispatch state.
  const acceptedOperation = (operation: string) =>
    input.store.getProgramOperation({ runId: input.claim.runId, operation }).pipe(
      Effect.mapError(storeFailure),
      Effect.flatMap((record) =>
        record === undefined
          ? ProgramCancelled.make({ reason: `Accepted Program operation ${operation} is missing` })
          : Effect.succeed(record),
      ),
    )
  const settleOperation = (
    operation: string,
    outcome: Parameters<RunStore["settleProgramOperation"]>[0]["outcome"],
    releaseSlots: number,
  ) =>
    input.store
      .settleProgramOperation({
        ...input.claim,
        commandId: JSON.stringify(["program-settle", input.claim.runId, input.claim.attemptFence, operation]),
        operation,
        outcome,
        releaseSlots,
      })
      .pipe(Effect.mapError(storeFailure))
  const executeOperation = <A>(
    program: PinnedProgram,
    options: {
      readonly operation: string
      readonly authoredOperation: string
      readonly kind: Exclude<ProgramOperationKind, "log">
      readonly capability: string
      readonly request: unknown
      readonly replay: ProgramReplayPolicy
      readonly reservation?: ProgramReservation
      readonly prepare: Effect.Effect<void, CapabilityFailure>
      readonly dispatch: Effect.Effect<A, CapabilityFailure>
      readonly validateResult: (value: SerializedValue) => Effect.Effect<A, InstanceType<typeof ProgramSchemaFailure>>
      readonly tokens?: (value: A) => number
    },
  ): Effect.Effect<A, CapabilityFailure> =>
    Effect.gen(function* () {
      const nowMillis = yield* Clock.currentTimeMillis
      const inputDigest = yield* digest(
        { kind: options.kind, capability: options.capability, input: options.request },
        OperationOutcome.inputBoundary[options.kind],
        options.capability,
      )
      const reservation = {
        ...input.claim,
        programPin: program.pin,
        budget: program.manifest.budget,
        operation: options.operation,
        authoredOperation: options.authoredOperation,
        kind: options.kind,
        capability: options.capability,
        inputDigest,
        input: options.request,
        replay: options.replay,
        reservation: options.reservation ?? {},
      }
      yield* input.store.reserveProgramOperation(reservation).pipe(Effect.mapError(storeFailure))
      const record = yield* acceptedOperation(options.operation)
      if (record.status === "succeeded") return yield* options.validateResult(record.result)
      if (record.status === "failed") return yield* storeFailure(record.error)
      if (record.status === "unknown") return yield* ProgramOperationUnknown.make({ operation: options.operation })
      if (record.status === "waiting") return yield* storeFailure(input.claimed.suspension)
      const prepareReserved = Effect.gen(function* () {
        const prepared = yield* Effect.exit(options.prepare)
        if (prepared._tag === "Failure") {
          const failure = failureFromExit(prepared.cause)
          if (Schema.is(ProgramSuspended)(failure)) {
            const openedAt = DateTime.formatIso(DateTime.makeUnsafe(nowMillis))
            const waitInput = {
              runId: input.claim.runId,
              operation: options.operation,
              capability: options.capability,
              request: options.request,
              reason: failure.reason,
            }
            const wait = programWait(failure.token === undefined ? waitInput : { ...waitInput, token: failure.token })
            const checkpoint = { _tag: "Program" as const, version: "1" as const }
            if (branch !== undefined) Object.assign(checkpoint, { branch })
            yield* input.store
              .suspendProgramOperation({
                ...reservation,
                suspension: failure,
                wait: { ...wait, status: "open", openedAt },
                checkpoint,
              })
              .pipe(Effect.mapError(storeFailure))
            return yield* failure
          }
          yield* settleOperation(
            options.operation,
            { _tag: "Failed", error: failure },
            options.reservation?.activeSlots ?? 0,
          )
          return yield* failure
        }
      })
      if (record.status === "reserved") {
        yield* prepareReserved
        yield* input.store
          .startProgramOperation({ ...input.claim, operation: options.operation })
          .pipe(Effect.mapError(storeFailure))
      }
      if (record.status === "running" && options.replay !== "idempotent") {
        yield* settleOperation(options.operation, { _tag: "Unknown" }, options.reservation?.activeSlots ?? 0)
        return yield* ProgramOperationUnknown.make({ operation: options.operation })
      }
      const dispatch = Effect.gen(function* () {
        const execution = yield* input.store.loadExecution(input.claim.runId).pipe(Effect.mapError(storeFailure))
        if (execution.ownerId !== input.claim.ownerId || execution.attemptFence !== input.claim.attemptFence) {
          return yield* ProgramCancelled.make({ reason: "Program execution ownership changed before dispatch" })
        }
        if (execution.cancellationRequested)
          return yield* ProgramCancelled.make({ reason: "Program execution was cancelled" })
        const exit = yield* Effect.exit(options.dispatch)
        if (exit._tag === "Success") {
          const value = yield* options.validateResult(exit.value)
          const outcome = OperationOutcome.succeeded(value, options.tokens?.(value))
          const settled = yield* settleOperation(options.operation, outcome, options.reservation?.activeSlots ?? 0)
          if (settled.status === "failed") return yield* storeFailure(settled.error)
          return value
        }
        const failure = failureFromExit(exit.cause)
        if (Schema.is(ProgramSuspended)(failure)) return yield* failure
        if (Schema.is(ProgramCancelled)(failure)) return yield* failure
        yield* settleOperation(
          options.operation,
          { _tag: "Failed", error: failure },
          options.reservation?.activeSlots ?? 0,
        )
        return yield* failure
      })
      return yield* dispatch
    })
  const runAgentMembers = makeAgentMembers({
    claim: input.claim,
    claimed: input.claimed,
    store: input.store,
    handlers: input.handlers.agents,
    ...Object.assign({}, input.children === undefined ? undefined : { children: input.children }),
    operationIdentity,
    acceptedOperation,
    settleOperation,
  })
  const callBinding = (program: PinnedProgram, raw: SerializedValue, kind: "tool" | "step") =>
    Effect.gen(function* () {
      const boundary = kind === "tool" ? "tool-input" : "step-input"
      const request = yield* strictDecode(kind === "tool" ? ToolCall : StepCall, boundary)(raw)
      const capability = "tool" in request ? request.tool : request.step
      const binding = (kind === "tool" ? tools : steps).get(capability)
      if (binding === undefined) return yield* ProgramCapabilityMissing.make({ capability })
      const invocation = yield* binding.decode(request.input).pipe(Effect.mapError(schemaFailure(boundary, capability)))
      const outputBoundary = kind === "tool" ? "tool-output" : "step-output"
      const validateResult = (result: SerializedValue) =>
        Schema.decodeUnknownEffect(binding.output, { onExcessProperty: "error" })(result).pipe(
          Effect.flatMap((decoded) => Schema.encodeEffect(binding.output, { onExcessProperty: "error" })(decoded)),
          Effect.flatMap((encoded) => Schema.decodeUnknownEffect(Schema.Json)(encoded)),
          Effect.mapError(schemaFailure(outputBoundary, capability)),
        )
      const operation = operationIdentity(request.operation)
      return yield* executeOperation(program, {
        operation,
        authoredOperation: request.operation,
        kind,
        capability,
        request,
        replay: binding.replay,
        reservation: kind === "tool" ? { toolCalls: 1, activeSlots: 1 } : { activeSlots: 1 },
        prepare: Authorization.authorize(input.claimed, invocation, operation, capability),
        validateResult,
        dispatch: invocation.execute.pipe(
          Effect.mapError((cause) =>
            kind === "tool"
              ? ProgramToolFailure.make({
                  tool: capability,
                  operation,
                  cause: Schema.is(ProgramInvocationFailure)(cause) ? cause.cause : cause,
                })
              : ProgramStepFailure.make({
                  step: capability,
                  operation,
                  cause: Schema.is(ProgramInvocationFailure)(cause) ? cause.cause : cause,
                }),
          ),
          Effect.flatMap((output) =>
            Schema.encodeEffect(binding.output, { onExcessProperty: "error" })(output).pipe(
              Effect.mapError(schemaFailure(outputBoundary, capability)),
            ),
          ),
        ),
      })
    })

  const makeCapabilities = (program: PinnedProgram) =>
    ProgramCapabilities.of({
      discoverTools: Effect.succeed(input.handlers.tools.map(({ name }) => ({ name }))),
      describeTool: (name) => {
        const binding = tools.get(name)
        if (binding === undefined) return Effect.fail(ProgramCapabilityMissing.make({ capability: name }))
        const describe = (schema: Schema.Top) =>
          SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast))
        return Effect.succeed({ name, inputSchema: describe(binding.input), outputSchema: describe(binding.output) })
      },
      callTool: (raw) => callBinding(program, raw, "tool"),
      callStep: (raw) => callBinding(program, raw, "step"),
      runAgent: (raw) =>
        strictDecode(
          AgentRun,
          "agent-input",
        )(raw).pipe(
          Effect.flatMap((request) =>
            runAgentMembers(program, {
              operation: request.operation,
              kind: "agent",
              members: [{ member: request.operation, selection: request.selection, input: request.input }],
            }),
          ),
          Effect.map((members) => members[0]!.result),
        ),
      mapAgents: (raw) =>
        strictDecode(
          AgentMap,
          "agent-input",
        )(raw).pipe(
          Effect.flatMap((request) =>
            runAgentMembers(program, {
              operation: request.operation,
              kind: "agent-map",
              members: request.members.map((member) => ({ ...member, selection: request.selection })),
            }),
          ),
        ),
      fanOutAgents: (raw) =>
        strictDecode(
          AgentFanOut,
          "agent-input",
        )(raw).pipe(
          Effect.flatMap((request) =>
            runAgentMembers(program, { operation: request.operation, kind: "agent-fan-out", members: request.members }),
          ),
        ),
      log: (raw) =>
        Effect.gen(function* () {
          const request = yield* strictDecode(Log, "program-output")(raw)
          const logEntry =
            request.data === undefined
              ? {
                  level: request.level,
                  message: request.message,
                }
              : { level: request.level, message: request.message, data: request.data }
          const bytes = yield* encodedBytes(logEntry)
          const inputDigest = yield* digest({ kind: "log", capability: "log", input: request }, "program-output", "log")
          const logRecord: CommitProgramLogInput = {
            ...input.claim,
            programPin: program.pin,
            budget: program.manifest.budget,
            operation: operationIdentity(request.operation),
            authoredOperation: request.operation,
            kind: "log",
            capability: "log",
            inputDigest,
            input: request,
            replay: "recorded",
            reservation: { logBytes: bytes },
            level: request.level,
            message: request.message,
          }
          yield* input.store
            .commitProgramLog(request.data === undefined ? logRecord : { ...logRecord, data: request.data })
            .pipe(Effect.mapError(storeFailure))
        }),
    })

  return ProgramRunner.of({
    execute: (request) =>
      Effect.gen(function* () {
        const actual = makeProgramManifest(request.program.manifest)
        if (actual.pin !== request.program.pin)
          return yield* ProgramIdentityMismatch.make({
            expected: request.program.pin,
            actual: actual.pin,
          })
        yield* validateHandlers(request.program, input.handlers)
        const capabilities = makeCapabilities(request.program)
        const signal = yield* Effect.abortSignal
        const now = yield* Clock.currentTimeMillis
        const state = yield* input.store.loadProgramState(input.claim.runId).pipe(Effect.mapError(storeFailure))
        const budget = state?.budget ?? request.program.manifest.budget
        const wallTimeMillis = state === undefined ? budget.wallClockMillis : Math.max(0, state.deadlineMillis - now)
        const execution = input.executor
          .execute(
            makeRequest({
              requestId: `${input.claim.runId}:${input.claim.attemptFence}`,
              source: request.program.manifest.source.text,
              inputCodec: request.program.manifest.input,
              outputCodec: request.program.manifest.output,
              encodedInput: request.input,
              signal,
              nowMillis: now,
              wallTimeMillis,
              outputBytes: budget.outputBytes,
              toolCalls: budget.toolCalls,
              agentRuns: budget.agentRuns,
              concurrency: budget.concurrency,
              tokens: budget.tokens,
              logBytes: budget.logBytes,
              tools: request.program.manifest.capabilities.tools.map((entry) => entry.name),
              steps: request.program.manifest.capabilities.steps.map((entry) => entry.name),
              agents: request.program.manifest.capabilities.agents.map((entry) => entry.selection),
            }),
          )
          .pipe(Effect.provideService(ProgramCapabilities, capabilities))
        const output = yield* execution.pipe(
          Effect.timeoutOrElse({
            duration: wallTimeMillis,
            orElse: () =>
              Effect.fail(
                ProgramBudgetExhausted.make({
                  dimension: "wallClockMillis",
                  limit: budget.wallClockMillis,
                }),
              ),
          }),
        )
        const outputBytes = yield* encodedBytes(output.output)
        if (outputBytes > budget.outputBytes)
          return yield* ProgramBudgetExhausted.make({ dimension: "outputBytes", limit: budget.outputBytes })
        return output.output
      }),
  })
}
