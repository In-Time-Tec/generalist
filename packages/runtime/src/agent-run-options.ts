import { Option, Schema } from "effect"
import { Agent, AgentEvent, DurableDriver } from "@batonfx/core"
import type { Prompt } from "effect/unstable/ai"
import type { ExecutionClaim, ExecutionRecord } from "./run-store.js"
import type { ExecutionContinuation } from "./steering.js"

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
  return {
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
    ...(input.compaction === undefined ? {} : { compaction: input.compaction }),
    ...(input.checkpoint === undefined ? {} : { driverCheckpoint: input.checkpoint }),
    ...(input.history === undefined ? {} : { history: input.history }),
    ...(input.turnStart === undefined && input.continuation === undefined
      ? {}
      : { turnStart: input.turnStart ?? input.continuation!.nextTurn }),
    ...(Option.isNone(suspension)
      ? {}
      : {
          resume: {
            suspension: suspension.value,
            ...(input.execution.resolution === undefined ? {} : { resolution: input.execution.resolution }),
          },
        }),
  }
}
