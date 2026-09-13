import { Clock, DateTime, Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import {
  type CapabilityFailure,
  type AgentMemberResult,
  type AgentRunResult,
  ProgramAgentFailure,
  ProgramCancelled,
  ProgramCapabilityMissing,
  ProgramOperationUnknown,
  ProgramSuspended,
} from "../../core/program/capabilities.js"
import type { Handlers, ProgramReplayPolicy } from "../../core/program/handlers.js"
import type { PinnedProgram } from "../../core/durable/manifest/program-manifest.js"
import { defaultInheritance } from "../../core/agent/lifecycle/fan-out.js"
import { childRunIdFor, fanOutIdFor } from "../child/fan-out-internal.js"
import { fanOutMemberSessionId } from "../child/session.js"
import type { ExecutionClaim, ExecutionRecord, Service as RunStore } from "../run/store.js"
import type { ProgramOperationRecord, ProgramOperationOutcome } from "./store.js"
import { AgentMemberResults, digest, failureFromExit, schemaFailure, storeFailure, strictDecode } from "./boundary.js"
import { Authorization } from "./authorization.js"
import type { Any as AnyAgent } from "../../core/agent/lifecycle/definition.js"
import { ExecutionScopeRetired, type ChildCapabilities } from "../execution/scope.js"

interface AgentRequest {
  readonly operation: string
  readonly kind: "agent" | "agent-map" | "agent-fan-out"
  readonly members: ReadonlyArray<{
    readonly member: string
    readonly selection: string
    readonly input: unknown
  }>
}

interface DecodedMember {
  readonly member: string
  readonly selection: string
  readonly prompt: Prompt.Prompt
}

interface Options {
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly store: RunStore
  readonly handlers: Handlers["agents"]
  readonly children?: ChildCapabilities<Readonly<Record<string, AnyAgent>>>
  readonly operationIdentity: (authoredOperation: string) => string
  readonly acceptedOperation: (operation: string) => Effect.Effect<ProgramOperationRecord, CapabilityFailure>
  readonly settleOperation: (
    operation: string,
    outcome: ProgramOperationOutcome,
    releaseSlots: number,
  ) => Effect.Effect<ProgramOperationRecord, CapabilityFailure>
}

const replayFor = (replays: ReadonlyArray<ProgramReplayPolicy>): ProgramReplayPolicy => {
  if (replays.includes("non-idempotent")) return "non-idempotent"
  if (replays.includes("idempotent")) return "idempotent"
  return "recorded"
}

export const make = (input: Options) => {
  const agents = new Map(input.handlers.map((handler) => [handler.selection, handler] as const))
  const { operationIdentity, acceptedOperation, settleOperation } = input
  const validateMemberKeys = (request: AgentRequest): Effect.Effect<void, ProgramAgentFailure> =>
    new Set(request.members.map((member) => member.member)).size === request.members.length
      ? Effect.void
      : ProgramAgentFailure.make({
          selection: request.kind,
          operation: request.operation,
          cause: "Agent member keys must be unique",
        })
  const resultFor = (selection: string, operation: string, runId: string) =>
    input.store.snapshot(runId).pipe(
      Effect.flatMap((snapshot) => {
        const outcome = snapshot.outcome
        if (outcome?._tag !== "Succeeded" || "_tag" in outcome.result) {
          return Effect.fail(
            ProgramAgentFailure.make({
              selection,
              operation,
              cause: outcome ?? `child Run ${runId} is not terminal`,
            }),
          )
        }
        let inputTokens = 0
        let outputTokens = 0
        for (const fact of snapshot.usageFacts) {
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
        Schema.is(ProgramAgentFailure)(cause) ? cause : ProgramAgentFailure.make({ selection, operation, cause }),
      ),
    )
  const restoreMembers = (program: PinnedProgram, request: AgentRequest, authoredOperation: string) =>
    Effect.gen(function* () {
      yield* input.store
        .reserveProgramOperation({
          ...input.claim,
          programPin: program.pin,
          budget: program.manifest.budget,
          operation: request.operation,
          authoredOperation,
          kind: request.kind,
          capability: request.kind === "agent-fan-out" ? "fan-out" : request.members[0]!.selection,
          inputDigest: yield* digest({ kind: request.kind, members: request.members }, "agent-input", request.kind),
          input: request.members,
          replay: "recorded",
          reservation: {},
        })
        .pipe(Effect.mapError(storeFailure))
      const retained = yield* acceptedOperation(request.operation)
      if (retained.status === "failed") return yield* storeFailure(retained.error)
      if (retained.status === "unknown")
        return yield* ProgramOperationUnknown.make({
          operation: request.operation,
        })
      return yield* strictDecode(AgentMemberResults, "agent-output", request.kind)(retained.result)
    })
  const decodeMembers = (request: AgentRequest) =>
    Effect.gen(function* () {
      const decoded: Array<DecodedMember> = []
      for (const member of request.members) {
        const binding = agents.get(member.selection)
        if (binding === undefined) {
          return yield* ProgramCapabilityMissing.make({
            capability: member.selection,
          })
        }
        const invocation = yield* binding
          .decode(member.input)
          .pipe(Effect.mapError(schemaFailure("agent-input", member.selection)))
        yield* Authorization.authorize(input.claimed, invocation, request.operation, member.selection)
        decoded.push({
          member: member.member,
          selection: member.selection,
          prompt: Prompt.make(invocation.prompt),
        })
      }
      return decoded
    })
  const settleMembers = ({
    request,
    record,
    decoded,
    concurrency,
    suspension,
  }: {
    readonly request: AgentRequest
    readonly record: ProgramOperationRecord
    readonly decoded: ReadonlyArray<DecodedMember>
    readonly concurrency: number
    readonly suspension: ProgramSuspended
  }) =>
    Effect.gen(function* () {
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
      if (settled.status === "failed") return yield* storeFailure(settled.error)
      return results
    })
  const runAgentMembers = (program: PinnedProgram, authoredRequest: AgentRequest) =>
    Effect.gen(function* () {
      const authoredOperation = authoredRequest.operation
      const request = {
        ...authoredRequest,
        operation: operationIdentity(authoredOperation),
      }
      if (request.members.length === 0) return []
      yield* validateMemberKeys(request)
      const prior = yield* input.store
        .getProgramOperation({
          runId: input.claim.runId,
          operation: request.operation,
        })
        .pipe(Effect.mapError(storeFailure))
      if (prior?.status === "succeeded" || prior?.status === "failed" || prior?.status === "unknown") {
        return yield* restoreMembers(program, request, authoredOperation)
      }
      const decoded = yield* decodeMembers(request)
      const fanOutId = fanOutIdFor(input.claim.runId, `program:${request.operation}`)
      const concurrency = Math.min(program.manifest.budget.concurrency, decoded.length)
      const nowMillis = yield* Clock.currentTimeMillis
      const suspension = ProgramSuspended.make({
        operation: request.operation,
        reason: "agent",
        token: `program-children:${request.operation}`,
      })
      yield* input.store
        .admitProgramAgents({
          ...input.claim,
          programPin: program.pin,
          budget: program.manifest.budget,
          operation: request.operation,
          authoredOperation,
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
              sessionId: fanOutMemberSessionId({
                fanOutId,
                key: member.member,
              }),
              metadata: {
                programOperation: request.operation,
                programMember: member.member,
              },
              origin: { operationKey: request.operation },
              inherit: defaultInheritance,
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
      const record = yield* acceptedOperation(request.operation)
      if (record.status === "succeeded")
        return yield* strictDecode(AgentMemberResults, "agent-output", request.kind)(record.result)
      if (record.status === "failed") return yield* storeFailure(record.error)
      if (record.status === "unknown")
        return yield* ProgramOperationUnknown.make({
          operation: request.operation,
        })
      if (record.status === "waiting") return yield* suspension
      return yield* settleMembers({ request, record, decoded, concurrency, suspension })
    })

  const runScopedAgentMembers = (
    program: PinnedProgram,
    authoredRequest: AgentRequest,
  ): Effect.Effect<ReadonlyArray<AgentMemberResult>, CapabilityFailure> =>
    Effect.gen(function* () {
      const children = input.children
      if (children === undefined) return yield* runAgentMembers(program, authoredRequest)
      const authoredOperation = authoredRequest.operation
      const request = { ...authoredRequest, operation: operationIdentity(authoredOperation) }
      if (request.members.length === 0) return []
      yield* validateMemberKeys(request)
      const decoded: Array<{
        readonly member: string
        readonly selection: string
        readonly agentName: string
        readonly input: unknown
      }> = []
      const replays: Array<ProgramReplayPolicy> = []
      for (const member of request.members) {
        const binding = agents.get(member.selection)
        if (binding === undefined) return yield* ProgramCapabilityMissing.make({ capability: member.selection })
        const invocation = yield* binding
          .decode(member.input)
          .pipe(Effect.mapError(schemaFailure("agent-input", member.selection)))
        yield* Authorization.authorize(input.claimed, invocation, request.operation, member.selection)
        decoded.push({ ...member, agentName: binding.agentName ?? member.selection, input: invocation.input })
        replays.push(binding.replay)
      }
      const replay = replayFor(replays)
      const concurrency = Math.min(program.manifest.budget.concurrency, decoded.length)
      yield* input.store
        .reserveProgramOperation({
          ...input.claim,
          programPin: program.pin,
          budget: program.manifest.budget,
          operation: request.operation,
          authoredOperation,
          kind: request.kind,
          capability: request.kind === "agent-fan-out" ? "fan-out" : decoded[0]!.selection,
          inputDigest: yield* digest({ kind: request.kind, members: request.members }, "agent-input", request.kind),
          input: request.members,
          replay,
          reservation: { agentRuns: decoded.length, activeSlots: concurrency },
        })
        .pipe(Effect.mapError(storeFailure))
      const record = yield* acceptedOperation(request.operation)
      if (record.status === "succeeded") {
        return yield* strictDecode(AgentMemberResults, "agent-output", request.kind)(record.result)
      }
      if (record.status === "failed") return yield* storeFailure(record.error)
      if (record.status === "unknown") return yield* ProgramOperationUnknown.make({ operation: request.operation })
      if (record.status === "waiting") {
        return yield* ProgramAgentFailure.make({
          selection: request.kind,
          operation: request.operation,
          cause: "Scoped Agent operation cannot resume a legacy fan-out wait",
        })
      }
      if (record.status === "reserved") {
        yield* input.store
          .startProgramOperation({ ...input.claim, operation: request.operation })
          .pipe(Effect.mapError(storeFailure))
      }
      const failureFor = (selection: string, cause: unknown) =>
        Schema.is(ExecutionScopeRetired)(cause)
          ? ProgramCancelled.make({ reason: "Program execution scope retired while running an Agent child" })
          : ProgramAgentFailure.make({ selection, operation: request.operation, cause })
      const exit = yield* Effect.exit(
        Effect.forEach(
          decoded,
          (member) =>
            children
              .start({
                agent: member.agentName,
                input: member.input,
                commandId: `program:${program.pin}:${request.operation}:${member.member}`,
                label: `Program ${request.operation}/${member.member}`,
              })
              .pipe(
                Effect.flatMap((receipt) =>
                  children.await(receipt).pipe(
                    Effect.flatMap((outcome): Effect.Effect<AgentRunResult, ProgramAgentFailure | ProgramCancelled> => {
                      if (outcome._tag === "Succeeded") {
                        return resultFor(member.selection, request.operation, receipt.childRunId)
                      }
                      if (outcome._tag === "Cancelled") {
                        return Effect.fail(
                          ProgramCancelled.make({
                            reason: outcome.reason ?? `Agent child ${receipt.childRunId} was cancelled`,
                          }),
                        )
                      }
                      return Effect.fail(
                        ProgramAgentFailure.make({
                          selection: member.selection,
                          operation: request.operation,
                          cause: outcome.failure,
                        }),
                      )
                    }),
                  ),
                ),
                Effect.mapError((cause) =>
                  Schema.is(ProgramAgentFailure)(cause) || Schema.is(ProgramCancelled)(cause)
                    ? cause
                    : failureFor(member.selection, cause),
                ),
                Effect.map((result) => ({ member: member.member, result })),
              ),
          { concurrency },
        ),
      )
      if (exit._tag === "Failure") {
        const failure = failureFromExit(exit.cause)
        if (Schema.is(ProgramCancelled)(failure)) return yield* failure
        yield* settleOperation(request.operation, { _tag: "Failed", error: failure }, concurrency)
        return yield* failure
      }
      const results = yield* strictDecode(AgentMemberResults, "agent-output", request.kind)(exit.value)
      const tokens = results.reduce(
        (total, member) => total + member.result.tokenUsage.input + member.result.tokenUsage.output,
        0,
      )
      const settled = yield* settleOperation(
        request.operation,
        { _tag: "Succeeded", value: results, tokens },
        concurrency,
      )
      if (settled.status === "failed") return yield* storeFailure(settled.error)
      return results
    })

  return input.children === undefined ? runAgentMembers : runScopedAgentMembers
}
