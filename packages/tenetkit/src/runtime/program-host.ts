import { Clock, DateTime, Effect, Schema, SchemaRepresentation } from "effect"
import { ProgramCapabilities, ProgramHost, ProgramManifest, SandboxExecutor, type ProgramBindings } from "tenetkit"
import type { ExecutionClaim, ExecutionRecord, Interface as RunStore } from "./run-store.js"
import type { ProgramOperationKind, ProgramReservation } from "./program-store.js"
import { childRunIdFor, fanOutIdFor } from "./fan-out.js"
import { fanOutMemberSessionId } from "./child-session.js"
import {
  AgentFanOut,
  AgentMap,
  AgentMemberResults,
  AgentRun,
  Log,
  StepCall,
  ToolCall,
  digest,
  encodedBytes,
  failureFromExit,
  schemaFailure,
  storeFailure,
  strictDecode,
} from "./program-boundary.js"
import { Prompt } from "effect/unstable/ai"
import { approvedFor, deniedFor, programWait } from "./program-approval.js"
export const make = (input: {
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly store: RunStore
  readonly sandbox: SandboxExecutor.Interface
  readonly bindings: ProgramBindings.Bindings
}): ProgramHost.Interface => {
  const tools = new Map(input.bindings.tools.map((binding) => [binding.name, binding] as const))
  const steps = new Map(input.bindings.steps.map((binding) => [binding.name, binding] as const))
  const agents = new Map(input.bindings.agents.map((binding) => [binding.selection, binding] as const))
  const settleOperation = (
    operation: string,
    outcome: Parameters<RunStore["settleProgramOperation"]>[0]["outcome"],
    releaseSlots: number,
  ) =>
    input.store
      .settleProgramOperation({ ...input.claim, operation, outcome, releaseSlots })
      .pipe(Effect.mapError(storeFailure))
  const authorize = (
    invocation: Pick<ProgramBindings.Invocation, "authorize">,
    operation: string,
    capability: string,
  ): Effect.Effect<void, ProgramCapabilities.CapabilityFailure> => {
    const denied = deniedFor(input.claimed, operation)
    if (denied !== undefined)
      return Effect.fail(ProgramCapabilities.ProgramCapabilityDenied.make({ capability, operation, reason: denied }))
    if (approvedFor(input.claimed, operation)) return Effect.void
    return invocation.authorize(operation).pipe(
      Effect.flatMap((allowed) =>
        allowed
          ? Effect.void
          : Effect.fail(
              ProgramCapabilities.ProgramCapabilityDenied.make({
                capability,
                operation,
                reason: "host authorization denied the operation",
              }),
            ),
      ),
    )
  }

  const executeOperation = <A>(
    program: ProgramManifest.PinnedProgram,
    options: {
      readonly operation: string
      readonly kind: ProgramOperationKind
      readonly capability: string
      readonly request: unknown
      readonly replay: ProgramBindings.ProgramReplayPolicy
      readonly reservation?: ProgramReservation
      readonly prepare: Effect.Effect<void, ProgramCapabilities.CapabilityFailure>
      readonly dispatch: Effect.Effect<A, ProgramCapabilities.CapabilityFailure>
      readonly validateResult: (
        value: unknown,
      ) => Effect.Effect<A, InstanceType<typeof ProgramCapabilities.ProgramSchemaFailure>>
      readonly tokens?: (value: A) => number
    },
  ): Effect.Effect<A, ProgramCapabilities.CapabilityFailure> =>
    Effect.gen(function* () {
      const nowMillis = yield* Clock.currentTimeMillis
      const inputDigest = yield* digest(
        { kind: options.kind, capability: options.capability, input: options.request },
        options.kind === "tool" ? "tool-input" : options.kind === "step" ? "step-input" : "agent-input",
        options.capability,
      )
      const reservation = {
        ...input.claim,
        programPin: program.pin,
        budget: program.manifest.budget,
        nowMillis,
        operation: options.operation,
        kind: options.kind,
        capability: options.capability,
        inputDigest,
        input: options.request,
        replay: options.replay,
        reservation: options.reservation ?? {},
      }
      const record = yield* input.store.reserveProgramOperation(reservation).pipe(Effect.mapError(storeFailure))
      if (record.status === "succeeded") return yield* options.validateResult(record.result)
      if (record.status === "failed") return yield* record.error as ProgramCapabilities.CapabilityFailure
      if (record.status === "unknown")
        return yield* ProgramCapabilities.ProgramOperationUnknown.make({ operation: options.operation })
      if (record.status === "waiting") return yield* input.claimed.suspension as ProgramCapabilities.CapabilityFailure
      if (record.status === "reserved") {
        const prepared = yield* Effect.exit(options.prepare)
        if (prepared._tag === "Failure") {
          const failure = failureFromExit(prepared.cause)
          if (Schema.is(ProgramCapabilities.ProgramSuspended)(failure)) {
            const openedAt = DateTime.formatIso(DateTime.makeUnsafe(nowMillis))
            const wait = programWait({
              runId: input.claim.runId,
              operation: options.operation,
              capability: options.capability,
              request: options.request,
              reason: failure.reason,
              ...(failure.token === undefined ? {} : { token: failure.token }),
            })
            yield* input.store
              .suspendProgramOperation({
                ...reservation,
                suspension: failure,
                wait: { ...wait, status: "open", openedAt },
                checkpoint: { _tag: "Program", version: "1" },
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
        yield* input.store
          .startProgramOperation({ ...input.claim, operation: options.operation })
          .pipe(Effect.mapError(storeFailure))
      }
      if (record.status === "running" && options.replay !== "idempotent") {
        yield* settleOperation(options.operation, { _tag: "Unknown" }, options.reservation?.activeSlots ?? 0)
        return yield* ProgramCapabilities.ProgramOperationUnknown.make({ operation: options.operation })
      }
      const exit = yield* Effect.exit(options.dispatch)
      if (exit._tag === "Success") {
        const value = yield* options.validateResult(exit.value)
        const outcome = {
          _tag: "Succeeded" as const,
          value,
          ...(options.tokens === undefined ? {} : { tokens: options.tokens(value) }),
        }
        const settled = yield* settleOperation(options.operation, outcome, options.reservation?.activeSlots ?? 0)
        if (settled.status === "failed") return yield* settled.error as ProgramCapabilities.CapabilityFailure
        return value
      }
      const failure = failureFromExit(exit.cause)
      if (Schema.is(ProgramCapabilities.ProgramSuspended)(failure)) return yield* failure
      if (Schema.is(ProgramCapabilities.ProgramCancelled)(failure)) return yield* failure
      yield* settleOperation(
        options.operation,
        { _tag: "Failed", error: failure },
        options.reservation?.activeSlots ?? 0,
      )
      return yield* failure
    })
  const resultFor = (selection: string, operation: string, runId: string) =>
    input.store.snapshot(runId).pipe(
      Effect.flatMap((snapshot) => {
        const outcome = snapshot.outcome
        if (outcome?._tag !== "Succeeded" || "_tag" in outcome.result) {
          return Effect.fail(
            ProgramCapabilities.ProgramAgentFailure.make({
              selection,
              operation,
              cause: outcome ?? `child Run ${runId} is not terminal`,
            }),
          )
        }
        let inputTokens = 0
        let outputTokens = 0
        for (const fact of snapshot.usage) {
          if (fact._tag !== "Completed") continue
          inputTokens += fact.usage.inputTokens.total ?? fact.usage.inputTokens.uncached ?? 0
          outputTokens += fact.usage.outputTokens.total ?? 0
        }
        return Effect.succeed({
          text: outcome.result.text,
          turns: outcome.result.turns,
          tokenUsage: { input: inputTokens, output: outputTokens },
        })
      }),
      Effect.mapError((cause) =>
        Schema.is(ProgramCapabilities.ProgramAgentFailure)(cause)
          ? cause
          : ProgramCapabilities.ProgramAgentFailure.make({ selection, operation, cause }),
      ),
    )
  const runAgentMembers = (
    program: ProgramManifest.PinnedProgram,
    request: {
      readonly operation: string
      readonly kind: "agent" | "agent-map" | "agent-fan-out"
      readonly members: ReadonlyArray<{ readonly member: string; readonly selection: string; readonly input: unknown }>
    },
  ) =>
    Effect.gen(function* () {
      if (request.members.length === 0) return []
      if (new Set(request.members.map((member) => member.member)).size !== request.members.length) {
        return yield* ProgramCapabilities.ProgramAgentFailure.make({
          selection: request.kind,
          operation: request.operation,
          cause: "Agent member keys must be unique",
        })
      }
      const decoded = [] as Array<{
        readonly member: string
        readonly selection: string
        readonly prompt: Prompt.Prompt
      }>
      for (const member of request.members) {
        const binding = agents.get(member.selection)
        if (binding === undefined) {
          return yield* ProgramCapabilities.ProgramCapabilityMissing.make({ capability: member.selection })
        }
        const invocation = yield* binding
          .decode(member.input)
          .pipe(Effect.mapError(schemaFailure("agent-input", member.selection)))
        yield* authorize(invocation, request.operation, member.selection)
        decoded.push({
          member: member.member,
          selection: member.selection,
          prompt: Prompt.make(invocation.prompt),
        })
      }
      const fanOutId = fanOutIdFor(input.claim.runId, `program:${request.operation}`)
      const concurrency = Math.min(program.manifest.budget.concurrency, decoded.length)
      const nowMillis = yield* Clock.currentTimeMillis
      const suspension = ProgramCapabilities.ProgramSuspended.make({
        operation: request.operation,
        reason: "agent",
        token: `program-children:${request.operation}`,
      })
      const record = yield* input.store
        .admitProgramAgents({
          ...input.claim,
          programPin: program.pin,
          budget: program.manifest.budget,
          nowMillis,
          operation: request.operation,
          kind: request.kind,
          capability: request.kind === "agent-fan-out" ? "fan-out" : decoded[0]!.selection,
          inputDigest: yield* digest({ kind: request.kind, members: request.members }, "agent-input", request.kind),
          input: request.members,
          replay: "recorded",
          reservation: { agentRuns: decoded.length, activeSlots: concurrency },
          fanOut: {
            fanOutId,
            parentRunId: input.claim.runId,
            idempotencyKey: `program:${request.operation}`,
            members: decoded.map((member, ordinal) => ({
              ordinal,
              key: member.member,
              childRunId: childRunIdFor(fanOutId, ordinal),
              selection: member.selection,
              prompt: member.prompt,
              sessionId: fanOutMemberSessionId({ fanOutId, key: member.member }),
              metadata: { programOperation: request.operation, programMember: member.member },
              origin: { operationKey: request.operation },
            })),
            concurrency,
            join: { _tag: "AllSuccess" },
            remainder: "await",
          },
          suspension,
          wait: {
            waitId: suspension.token!,
            reason: { _tag: "External", capability: "agent" },
            status: "open",
            openedAt: DateTime.formatIso(DateTime.makeUnsafe(nowMillis)),
          },
        })
        .pipe(Effect.mapError(storeFailure))
      if (record.status === "succeeded")
        return yield* strictDecode(AgentMemberResults, "agent-output", request.kind)(record.result)
      if (record.status === "failed") return yield* record.error as ProgramCapabilities.CapabilityFailure
      if (record.status === "waiting") return yield* suspension
      const aggregate = yield* input.store.inspectFanOut(record.fanOutId!).pipe(Effect.mapError(storeFailure))
      if (aggregate.status === "running") return yield* suspension
      const resultExit = yield* Effect.exit(
        Effect.forEach(decoded, (member, ordinal) =>
          resultFor(member.selection, request.operation, record.childRunIds[ordinal]!).pipe(
            Effect.map((result) => ({ member: member.member, result })),
          ),
        ),
      )
      if (resultExit._tag === "Failure") {
        const failure = failureFromExit(resultExit.cause)
        yield* settleOperation(request.operation, { _tag: "Failed", error: failure }, concurrency)
        return yield* failure
      }
      const results = yield* strictDecode(AgentMemberResults, "agent-output", request.kind)(resultExit.value)
      const tokens = results.reduce(
        (total, member) => total + member.result.tokenUsage.input + member.result.tokenUsage.output,
        0,
      )
      const settled = yield* settleOperation(
        request.operation,
        { _tag: "Succeeded", value: results, tokens },
        concurrency,
      )
      if (settled.status === "failed") return yield* settled.error as ProgramCapabilities.CapabilityFailure
      return results
    })

  const callBinding = (program: ProgramManifest.PinnedProgram, raw: unknown, kind: "tool" | "step") =>
    Effect.gen(function* () {
      const boundary = kind === "tool" ? "tool-input" : "step-input"
      const request = yield* strictDecode(kind === "tool" ? ToolCall : StepCall, boundary)(raw)
      const capability = "tool" in request ? request.tool : request.step
      const binding = (kind === "tool" ? tools : steps).get(capability)
      if (binding === undefined) return yield* ProgramCapabilities.ProgramCapabilityMissing.make({ capability })
      const invocation = yield* binding.decode(request.input).pipe(Effect.mapError(schemaFailure(boundary, capability)))
      const outputBoundary = kind === "tool" ? "tool-output" : "step-output"
      const validateResult = (result: unknown) =>
        Schema.decodeUnknownEffect(binding.output, { onExcessProperty: "error" })(result).pipe(
          Effect.flatMap((decoded) => Schema.encodeEffect(binding.output, { onExcessProperty: "error" })(decoded)),
          Effect.flatMap((encoded) => Schema.decodeUnknownEffect(Schema.Json)(encoded)),
          Effect.mapError(schemaFailure(outputBoundary, capability)),
        )
      const operation = request.operation
      return yield* executeOperation(program, {
        operation,
        kind,
        capability,
        request,
        replay: binding.replay,
        reservation: kind === "tool" ? { toolCalls: 1, activeSlots: 1 } : { activeSlots: 1 },
        prepare: authorize(invocation, operation, capability),
        validateResult,
        dispatch: invocation.execute.pipe(
          Effect.mapError((cause) =>
            kind === "tool"
              ? ProgramCapabilities.ProgramToolFailure.make({
                  tool: capability,
                  operation,
                  cause: Schema.is(ProgramCapabilities.ProgramInvocationFailure)(cause) ? cause.cause : cause,
                })
              : ProgramCapabilities.ProgramStepFailure.make({
                  step: capability,
                  operation,
                  cause: Schema.is(ProgramCapabilities.ProgramInvocationFailure)(cause) ? cause.cause : cause,
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

  const makeCapabilities = (program: ProgramManifest.PinnedProgram) =>
    ProgramCapabilities.ProgramCapabilities.of({
      discoverTools: Effect.succeed(input.bindings.tools.map(({ name }) => ({ name }))),
      describeTool: (name) => {
        const binding = tools.get(name)
        if (binding === undefined)
          return Effect.fail(ProgramCapabilities.ProgramCapabilityMissing.make({ capability: name }))
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
          const bytes = yield* encodedBytes({
            level: request.level,
            message: request.message,
            ...(request.data === undefined ? {} : { data: request.data }),
          })
          const nowMillis = yield* Clock.currentTimeMillis
          const inputDigest = yield* digest({ kind: "log", capability: "log", input: request }, "program-output", "log")
          yield* input.store
            .commitProgramLog({
              ...input.claim,
              programPin: program.pin,
              budget: program.manifest.budget,
              nowMillis,
              operation: request.operation,
              kind: "log",
              capability: "log",
              inputDigest,
              input: request,
              replay: "recorded",
              reservation: { logBytes: bytes },
              level: request.level,
              message: request.message,
              ...(request.data === undefined ? {} : { data: request.data }),
            })
            .pipe(Effect.mapError(storeFailure))
        }),
    })

  return ProgramHost.ProgramHost.of({
    execute: (request) =>
      Effect.gen(function* () {
        const actual = ProgramManifest.make(request.program.manifest)
        if (actual.pin !== request.program.pin)
          return yield* ProgramHost.ProgramIdentityMismatch.make({ expected: request.program.pin, actual: actual.pin })
        yield* ProgramHost.validateBindings(request.program, input.bindings)
        const capabilities = makeCapabilities(request.program)
        const signal = yield* Effect.abortSignal
        const now = yield* Clock.currentTimeMillis
        const budget = request.program.manifest.budget
        const execution = input.sandbox
          .execute(
            SandboxExecutor.makeRequest({
              requestId: `${input.claim.runId}:${input.claim.attemptFence}`,
              source: request.program.manifest.source.text,
              inputCodec: request.program.manifest.input,
              outputCodec: request.program.manifest.output,
              encodedInput: request.input,
              signal,
              nowMillis: now,
              wallTimeMillis: budget.wallClockMillis,
              outputBytes: budget.outputBytes,
              toolCalls: budget.toolCalls,
              agentRuns: budget.agentRuns,
              tools: request.program.manifest.capabilities.tools.map((entry) => entry.name),
              steps: request.program.manifest.capabilities.steps.map((entry) => entry.name),
              agents: request.program.manifest.capabilities.agents.map((entry) => entry.selection),
            }),
          )
          .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities))
        const output = yield* execution.pipe(
          Effect.timeoutOrElse({
            duration: request.program.manifest.budget.wallClockMillis,
            orElse: () =>
              Effect.fail(
                ProgramCapabilities.ProgramBudgetExhausted.make({
                  dimension: "wallClockMillis",
                  limit: request.program.manifest.budget.wallClockMillis,
                }),
              ),
          }),
        )
        const value = output.output
        const outputBytes = yield* encodedBytes(value)
        if (outputBytes > request.program.manifest.budget.outputBytes)
          return yield* ProgramCapabilities.ProgramBudgetExhausted.make({
            dimension: "outputBytes",
            limit: request.program.manifest.budget.outputBytes,
          })
        return value
      }),
  })
}
