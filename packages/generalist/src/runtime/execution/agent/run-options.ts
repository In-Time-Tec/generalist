import { Option, Schema } from "effect"
import type { RunOptions } from "../../../core/agent/service.js"
import { AgentSuspended } from "../../../core/agent/event.js"
import type { DriverCheckpoint } from "../../../core/durable/driver.js"
import type { Prompt } from "effect/unstable/ai"
import type { ExecutionClaim, ExecutionRecord } from "../../run/store.js"
import type { ExecutionContinuation } from "../../run/steering.js"
import { Suspended as NestedOperationSuspended } from "../../../core/tools/nested-operation.js"

type HostedRunOptions = Omit<RunOptions, "memory" | "steering">

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
}): HostedRunOptions | undefined => {
  const suspension = input.resume ? input.execution.suspension : undefined
  const agentSuspension = Schema.decodeUnknownOption(AgentSuspended)(suspension)
  const nestedSuspension = Schema.decodeUnknownOption(NestedOperationSuspended)(suspension)
  if (suspension !== undefined && Option.isNone(agentSuspension) && Option.isNone(nestedSuspension)) return undefined
  const options: HostedRunOptions = {
    prompt: input.prompt,
    sessionId: input.execution.message.sessionId,
    logicalOperationId: input.execution.runId,
    invocation: {
      runId: input.execution.runId,
      rootRunId: input.execution.rootRunId,
      attempt: input.attempt,
      admittedAt: input.execution.admittedAt,
    },
    executableRef: input.execution.executableRef,
    executableManifest: input.execution.executableManifest,
    budget: input.budget,
  }
  if (input.compaction !== undefined) Object.assign(options, { compaction: input.compaction })
  if (input.checkpoint !== undefined) Object.assign(options, { driverCheckpoint: input.checkpoint })
  if (input.history !== undefined) Object.assign(options, { history: input.history })
  const turnStart = input.turnStart ?? input.continuation?.nextTurn
  if (turnStart !== undefined) Object.assign(options, { turnStart })
  if (Option.isSome(agentSuspension)) {
    const resume: NonNullable<HostedRunOptions["resume"]> = { suspension: agentSuspension.value }
    const waitIds = new Set(agentSuspension.value.waits.map((wait) => wait.waitId))
    const resolutions = input.execution.resolutions.filter((entry) => waitIds.has(entry.waitId))
    if (resolutions.length > 0) Object.assign(resume, { resolutions })
    Object.assign(options, { resume })
  }
  return options
}
