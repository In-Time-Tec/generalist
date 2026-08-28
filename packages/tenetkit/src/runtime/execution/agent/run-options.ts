import { Option, Schema } from "effect"
import { Agent } from "../../../core/index.js"
import { AgentEvent } from "../../../core/agent/public/event.js"
import { DurableDriver } from "../../../core/durable/public/driver.js"
import type { Prompt } from "effect/unstable/ai"
import type { ExecutionClaim, ExecutionRecord } from "../../run/store.js"
import type { ExecutionContinuation } from "../../run/steering.js"

type HostedRunOptions = Omit<Agent.RunOptions, "memory" | "persistence" | "runtime">

export const make = (input: {
  readonly claim: ExecutionClaim
  readonly execution: ExecutionRecord
  readonly attempt: number
  readonly prompt: Prompt.RawInput
  readonly history?: Prompt.Prompt
  readonly checkpoint?: DurableDriver.DriverCheckpoint
  readonly continuation?: ExecutionContinuation
  readonly turnStart?: number
  readonly resume: boolean
  readonly budget: NonNullable<Agent.RunOptions["budget"]>
  readonly compaction?: Agent.RunOptions["compaction"]
}): HostedRunOptions | undefined => {
  const suspension =
    !input.resume || input.execution.suspension === undefined
      ? Option.none<AgentEvent.AgentSuspended>()
      : Schema.decodeUnknownOption(AgentEvent.AgentSuspended)(input.execution.suspension)
  if (input.resume && input.execution.suspension !== undefined && Option.isNone(suspension)) return undefined
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
    sessionOwnerToken: `${input.claim.ownerId}:${input.claim.attemptFence}`,
    executableRef: input.execution.executableRef,
    executableManifest: input.execution.executableManifest,
    budget: input.budget,
  }
  if (input.compaction !== undefined) Object.assign(options, { compaction: input.compaction })
  if (input.checkpoint !== undefined) Object.assign(options, { driverCheckpoint: input.checkpoint })
  if (input.history !== undefined) Object.assign(options, { history: input.history })
  const turnStart = input.turnStart ?? input.continuation?.nextTurn
  if (turnStart !== undefined) Object.assign(options, { turnStart })
  if (Option.isSome(suspension)) {
    const resume: NonNullable<HostedRunOptions["resume"]> = { suspension: suspension.value }
    if (input.execution.resolution !== undefined) Object.assign(resume, { resolution: input.execution.resolution })
    Object.assign(options, { resume })
  }
  return options
}
