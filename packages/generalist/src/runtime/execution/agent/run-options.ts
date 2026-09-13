import { Option, type Ref, Schema } from "effect"
import type { RunOptions } from "../../../core/agent/service.js"
import type { HostedExecutionOptions } from "../../../core/agent/lifecycle/hosted/options.js"
import { AgentSuspended } from "../../../core/agent/event.js"
import type { DriverCheckpoint } from "../../../core/durable/driver.js"
import type { Prompt } from "effect/unstable/ai"
import type { ExecutionClaim, ExecutionRecord } from "../../run/store.js"
import type { ExecutionContinuation } from "../../run/steering.js"
import { Suspended as NestedOperationSuspended } from "../../../core/tools/nested-operation.js"

const sandboxInvocation = (snapshot: Ref.Ref<string | undefined> | undefined) =>
  snapshot === undefined ? {} : { inheritedSandboxSnapshot: snapshot }

const continuationOptions = (
  continuation: ExecutionContinuation | undefined,
): Pick<HostedExecutionOptions, "turnStart" | "initialSteering"> => {
  if (continuation === undefined) return {}
  return {
    turnStart: continuation.nextTurn,
    initialSteering: {
      queue: continuation.queue ?? "steering",
      count: continuation.steeringEntryIds.length,
      turn: Math.max(0, continuation.nextTurn - 1),
    },
  }
}

export const make = (input: {
  readonly claim: ExecutionClaim
  readonly execution: ExecutionRecord
  readonly attempt: number
  readonly prompt: Prompt.RawInput
  readonly history?: Prompt.Prompt
  readonly checkpoint?: DriverCheckpoint
  readonly continuation?: ExecutionContinuation
  readonly turnStart?: number
  readonly resume: boolean
  readonly budget: NonNullable<RunOptions["budget"]>
  readonly compaction?: RunOptions["compaction"]
  readonly inheritedSandboxSnapshot: Ref.Ref<string | undefined> | undefined
}): HostedExecutionOptions | undefined => {
  const suspension = input.resume ? input.execution.suspension : undefined
  const agentSuspension = Schema.decodeUnknownOption(AgentSuspended)(suspension)
  const nestedSuspension = Schema.decodeUnknownOption(NestedOperationSuspended)(suspension)
  if (suspension !== undefined && Option.isNone(agentSuspension) && Option.isNone(nestedSuspension)) return undefined
  const options: HostedExecutionOptions = {
    prompt: input.prompt,
    sessionId: input.execution.message.sessionId,
    logicalOperationId: input.execution.operationNamespace ?? input.execution.runId,
    invocation: {
      runId: input.execution.runId,
      rootRunId: input.execution.rootRunId,
      attempt: input.attempt,
      admittedAt: input.execution.admittedAt,
      ...sandboxInvocation(input.inheritedSandboxSnapshot),
    },
    executableRef: input.execution.executableRef,
    executableManifest: input.execution.executableManifest,
    budget: input.budget,
    ...continuationOptions(input.continuation),
  }
  if (input.compaction !== undefined) Object.assign(options, { compaction: input.compaction })
  if (input.checkpoint !== undefined) Object.assign(options, { driverCheckpoint: input.checkpoint })
  if (input.history !== undefined) Object.assign(options, { history: input.history })
  if (input.turnStart !== undefined) Object.assign(options, { turnStart: input.turnStart })
  if (Option.isSome(agentSuspension)) {
    const resume: NonNullable<HostedExecutionOptions["resume"]> = { suspension: agentSuspension.value }
    const waitIds = new Set(agentSuspension.value.waits.map((wait) => wait.waitId))
    const resolutions = input.execution.resolutions.filter((entry) => waitIds.has(entry.waitId))
    if (resolutions.length > 0) Object.assign(resume, { resolutions })
    Object.assign(options, { resume })
  }
  return options
}
