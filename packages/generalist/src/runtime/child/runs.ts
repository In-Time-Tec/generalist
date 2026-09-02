import { Effect, Option, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { ToolContext } from "../../core/tools/tool-context.js"
import type { Outcome } from "../../core/tools/tool-executor.js"
import type { Service as RunStoreService } from "../run/store.js"
import type { RunSnapshot } from "../run.js"
import { make as makeAddress } from "../address.js"
import { make as makeMessage } from "../messaging/message.js"
import { normalizePrompt } from "../memory/prompt.js"
import { childRunIdFor, fanOutIdFor } from "./fan-out-internal.js"
import { fanOutMemberSessionId } from "./session.js"
import { GroupReceipt, resultFromInspection } from "./group.js"
import { ChildLifecycle } from "./lifecycle.js"
import { ChildRuns, catchDomainFailure, success, type FanOutGroupInput, type Service } from "./executor.js"
import { inheritance, Inheritance } from "../../core/agent/lifecycle/fan-out.js"

export * from "./group.js"
type Mutable<Value> = Value extends Value ? { -readonly [Key in keyof Value]: Value[Key] } : never
type MutableResult = Mutable<typeof import("./group.js").Result.Type>

export { ChildRuns, Executor, route } from "./executor.js"
export type { AwaitGroupInput, FanOutGroupInput, Input, Service, StartGroupInput } from "./executor.js"

const lifecycleIdentity = (parent: Option.Option<typeof ToolContext.Service>) => ({
  agentName: Option.isSome(parent) ? (parent.value.agentName ?? "runtime") : "runtime",
  turn: Option.isSome(parent) ? (parent.value.turn ?? 0) : 0,
})

const childResultFromSnapshot = (childRunId: string, snapshot: RunSnapshot): MutableResult | undefined => {
  if (snapshot.outcome?._tag === "Succeeded") {
    return "text" in snapshot.outcome.result
      ? {
          _tag: "Succeeded",
          childRunId,
          text: snapshot.outcome.result.text,
          turns: snapshot.outcome.result.turns,
        }
      : { _tag: "Failed", childRunId, message: "non-Agent child executable" }
  }
  if (snapshot.outcome?._tag === "Failed") {
    return { _tag: "Failed", childRunId, message: snapshot.outcome.error.message }
  }
  if (snapshot.outcome?._tag !== "Cancelled") return undefined
  const result: MutableResult = { _tag: "Cancelled", childRunId }
  if (snapshot.outcome.reason !== undefined) result.reason = snapshot.outcome.reason
  return result
}

/** Construct Runtime-owned child execution operations over one RunStore. */
export const make = (store: RunStoreService): Service => {
  interface Origin {
    parentToolCallId: string
    operationKey?: string
  }
  interface ChildMetadata extends Record<string, unknown> {
    runtimeChildTool: true
    parentRunId: string
    parentToolCallId: string
    childLabel?: string
  }
  interface GroupMetadata extends Record<string, unknown> {
    runtimeChildGroup: true
    parentRunId: string
    parentToolCallId: string
    childGroupId: string
    childGroupKey: string
    childGroupLabel?: string
    childInheritancePolicy: Schema.Json
    parentAgentName: string
  }
  type MutableReceiptChild = {
    -readonly [Key in keyof GroupReceipt["children"][number]]: GroupReceipt["children"][number][Key]
  }
  const invoke: Service["invoke"] = (input) =>
    catchDomainFailure(
      Effect.gen(function* () {
        const parent = yield* Effect.serviceOption(ToolContext)
        const identity = lifecycleIdentity(parent)
        const child: Mutable<import("../../hooks/index.js").Child> = {
          operation: input.operationKey ?? input.toolCallId,
          selection: input.selection,
          prompt: Prompt.make(input.prompt),
        }
        if (input.label !== undefined) child.label = input.label
        yield* ChildLifecycle.start(
          {
            runId: input.parentRunId,
            ...identity,
            child,
          },
          `'${input.selection}'`,
        )
        const idempotencyKey = `child-tool:${input.parentRunId}:${input.toolCallId}`
        const origin: Origin = { parentToolCallId: input.toolCallId }
        if (input.operationKey !== undefined) origin.operationKey = input.operationKey
        const metadata: ChildMetadata = {
          runtimeChildTool: true,
          parentRunId: input.parentRunId,
          parentToolCallId: input.toolCallId,
        }
        if (input.label !== undefined) metadata.childLabel = input.label
        const admission = {
          parentRunId: input.parentRunId,
          invocationId: input.toolCallId,
          selection: input.selection,
          origin,
          prompt: input.prompt,
          message: makeMessage({
            id: `spawn:${idempotencyKey}`,
            to: makeAddress(`spawn:${input.parentRunId}`),
            sessionId: `child:${input.parentRunId}`,
            prompt: normalizePrompt(input.prompt),
            idempotencyKey,
            correlationId: input.parentRunId,
            metadata,
          }),
        }
        const admissionWithLabel: typeof admission & { label?: string } = admission
        if (input.label !== undefined) admissionWithLabel.label = input.label
        const receipt = yield* store.admitSpawn(admissionWithLabel)
        const snapshot = yield* store.snapshot(receipt.runId)
        const result = childResultFromSnapshot(receipt.runId, snapshot)
        if (result === undefined) return { _tag: "Suspend" as const, token: receipt.runId }
        if (input.label !== undefined) result.label = input.label
        return success(
          yield* ChildLifecycle.end(
            {
              runId: input.parentRunId,
              ...identity,
              child: { ...child, childRunId: receipt.runId },
              result,
            },
            `'${input.selection}'`,
          ),
        )
      }),
    )

  const admitGroup = (input: FanOutGroupInput) =>
    Effect.gen(function* () {
      const idempotencyKey = `child-group:${input.parentRunId}:${input.toolCallId}`
      const groupId = fanOutIdFor(input.parentRunId, idempotencyKey)
      const parent = yield* Effect.serviceOption(ToolContext)
      const agentName = Option.isSome(parent) ? (parent.value.agentName ?? "runtime") : "runtime"
      const turn = Option.isSome(parent) ? (parent.value.turn ?? 0) : 0
      for (const [ordinal, member] of input.members.entries()) {
        const child: Mutable<import("../../hooks/index.js").Child> = {
          operation: `${groupId}:${member.key}`,
          selection: member.selection,
          prompt: Prompt.make(member.prompt),
          childRunId: childRunIdFor(groupId, ordinal),
        }
        if (member.label !== undefined) child.label = member.label
        yield* ChildLifecycle.start(
          { runId: input.parentRunId, agentName, turn, child },
          `group member '${member.key}'`,
        )
      }
      const receipt = yield* store.admitFanOut({
        fanOutId: groupId,
        parentRunId: input.parentRunId,
        idempotencyKey,
        ...Object.assign(
          {},
          input.concurrency === undefined
            ? undefined
            : { concurrency: Math.min(input.concurrency, input.members.length) },
        ),
        ...Object.assign({}, input.budgetDivisor === undefined ? undefined : { budgetDivisor: input.budgetDivisor }),
        join: input.join,
        remainder: input.remainder,
        members: input.members.map((member, ordinal) => {
          const metadata: GroupMetadata = {
            runtimeChildGroup: true,
            parentRunId: input.parentRunId,
            parentToolCallId: input.toolCallId,
            childGroupId: groupId,
            childGroupKey: member.key,
            childInheritancePolicy: Schema.decodeSync(Schema.Json)(
              Schema.encodeSync(Inheritance)(inheritance(member.inherit)),
            ),
            parentAgentName: agentName,
          }
          if (member.label !== undefined) metadata.childGroupLabel = member.label
          const origin: Origin = { parentToolCallId: input.toolCallId }
          if (input.operationKey !== undefined) origin.operationKey = input.operationKey
          const admitted = {
            ordinal,
            key: member.key,
            childRunId: childRunIdFor(groupId, ordinal),
            selection: member.selection,
            prompt:
              member.history === undefined
                ? normalizePrompt(member.prompt)
                : Prompt.concat(member.history, Prompt.make(normalizePrompt(member.prompt))),
            sessionId: fanOutMemberSessionId({ fanOutId: groupId, key: member.key }),
            metadata,
            origin,
            inherit: inheritance(member.inherit),
          }
          const admittedWithLabel: typeof admitted & { label?: string } = admitted
          if (member.label !== undefined) admittedWithLabel.label = member.label
          return admittedWithLabel
        }),
      })
      const inspection = yield* store.inspectFanOut(receipt.fanOutId)
      const result: GroupReceipt = {
        groupId: receipt.fanOutId,
        children: inspection.members.map((member) => {
          const child: MutableReceiptChild = {
            key: member.key,
            selection: member.selection,
            childRunId: member.childRunId,
            depth: member.depth,
            readiness: member.readiness,
          }
          if (member.label !== undefined) child.label = member.label
          return child
        }),
      }
      return { receipt: result, inspection }
    })

  const startGroup: Service["startGroup"] = (input) =>
    catchDomainFailure(
      admitGroup({ ...input, join: { _tag: "AllSettled" }, remainder: "await" }).pipe(
        Effect.map(({ receipt }) => success(receipt)),
      ),
    )

  const runGroup: Service["runGroup"] = (input) =>
    catchDomainFailure(
      admitGroup({ ...input, join: { _tag: "AllSettled" }, remainder: "await" }).pipe(
        Effect.flatMap(({ receipt, inspection }) =>
          inspection.status === "running"
            ? Effect.succeed<Outcome>({ _tag: "Suspend", token: receipt.groupId })
            : ChildLifecycle.endGroup(input.parentRunId, resultFromInspection(inspection)).pipe(Effect.map(success)),
        ),
      ),
    )

  const fanOut: Service["fanOut"] = (input) =>
    catchDomainFailure(
      admitGroup(input).pipe(
        Effect.flatMap(({ receipt, inspection }) =>
          inspection.status === "running"
            ? Effect.succeed<Outcome>({ _tag: "Suspend", token: receipt.groupId })
            : ChildLifecycle.endGroup(input.parentRunId, resultFromInspection(inspection)).pipe(Effect.map(success)),
        ),
      ),
    )

  const awaitGroup: Service["awaitGroup"] = (input) =>
    catchDomainFailure(
      store.inspectFanOut(input.groupId).pipe(
        Effect.flatMap((inspection) => {
          if (inspection.parentRunId !== input.parentRunId) {
            return Effect.fail({
              message: `child group ${input.groupId} is not owned by parent Run ${input.parentRunId}`,
            })
          }
          return inspection.status === "running"
            ? Effect.succeed<Outcome>({ _tag: "Suspend", token: input.groupId })
            : ChildLifecycle.endGroup(input.parentRunId, resultFromInspection(inspection)).pipe(Effect.map(success))
        }),
      ),
    )

  const transformResolved: Service["transformResolved"] = (request, outcome) =>
    catchDomainFailure(ChildLifecycle.transformResolved(request, outcome))

  return ChildRuns.of({ invoke, runGroup, startGroup, awaitGroup, fanOut, transformResolved })
}
