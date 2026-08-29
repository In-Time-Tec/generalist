import { Function } from "effect"

/** @experimental Derive one stable typed wait from a suspended Program operation. */
export const programWait = (input: {
  readonly runId: string
  readonly operation: string
  readonly capability: string
  readonly request: unknown
  readonly token?: string
  readonly reason: "approval" | "tool-wait" | "agent" | "step"
}) => {
  const approvalId = input.token ?? `approval:${input.runId}:${input.operation}`
  let reason
  if (input.reason === "approval") {
    reason = {
      _tag: "Approval" as const,
      request: {
        approvalId,
        operation: input.operation,
        capability: input.capability,
        input: input.request,
      },
    }
  } else if (input.reason === "tool-wait") {
    reason = { _tag: "ToolWait" as const }
  } else {
    reason = { _tag: "External" as const, capability: input.capability }
  }
  return {
    waitId: input.reason === "approval" ? approvalId : (input.token ?? `program:${input.operation}`),
    reason,
  }
}

export const approvedFor: {
  (operation: string): (claimed: import("../run/store.js").ExecutionRecord) => boolean
  (claimed: import("../run/store.js").ExecutionRecord, operation: string): boolean
} = Function.dual(2, (claimed: import("../run/store.js").ExecutionRecord, operation: string): boolean => {
  const waitInput = {
    runId: claimed.runId,
    operation,
    capability: operation,
    request: undefined,
    reason: "approval",
  } as const
  const token = claimed.suspension?._tag === "tenetkit/core/ProgramSuspended" ? claimed.suspension.token : undefined
  const wait = programWait(token === undefined ? waitInput : { ...waitInput, token })
  return (
    claimed.suspension?._tag === "tenetkit/core/ProgramSuspended" &&
    claimed.suspension.operation === operation &&
    claimed.suspension.reason === "approval" &&
    claimed.resolutions.find((entry) => entry.waitId === wait.waitId)?.resolution._tag === "Approved"
  )
})

export const deniedFor: {
  (operation: string): (claimed: import("../run/store.js").ExecutionRecord) => string | undefined
  (claimed: import("../run/store.js").ExecutionRecord, operation: string): string | undefined
} = Function.dual(2, (claimed: import("../run/store.js").ExecutionRecord, operation: string): string | undefined => {
  const waitInput = {
    runId: claimed.runId,
    operation,
    capability: operation,
    request: undefined,
    reason: "approval",
  } as const
  const token = claimed.suspension?._tag === "tenetkit/core/ProgramSuspended" ? claimed.suspension.token : undefined
  const wait = programWait(token === undefined ? waitInput : { ...waitInput, token })
  const resolution = claimed.resolutions.find((entry) => entry.waitId === wait.waitId)?.resolution
  return claimed.suspension?._tag === "tenetkit/core/ProgramSuspended" &&
    claimed.suspension.operation === operation &&
    claimed.suspension.reason === "approval" &&
    resolution?._tag === "Denied"
    ? (resolution.reason ?? "approval denied")
    : undefined
})
