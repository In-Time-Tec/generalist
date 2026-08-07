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
  return {
    waitId: input.reason === "approval" ? approvalId : (input.token ?? `program:${input.operation}`),
    reason:
      input.reason === "approval"
        ? {
            _tag: "Approval" as const,
            request: {
              approvalId,
              operation: input.operation,
              capability: input.capability,
              input: input.request,
            },
          }
        : input.reason === "tool-wait"
          ? { _tag: "ToolWait" as const }
          : { _tag: "External" as const, capability: input.capability },
  }
}

export const approvedFor: {
  (operation: string): (claimed: import("./run-store.js").ExecutionRecord) => boolean
  (claimed: import("./run-store.js").ExecutionRecord, operation: string): boolean
} = Function.dual(
  2,
  (claimed: import("./run-store.js").ExecutionRecord, operation: string): boolean =>
    claimed.suspension?._tag === "@batonfx/core/ProgramSuspended" &&
    claimed.suspension.operation === operation &&
    claimed.suspension.reason === "approval" &&
    claimed.resolution?._tag === "Approved",
)

export const deniedFor: {
  (operation: string): (claimed: import("./run-store.js").ExecutionRecord) => string | undefined
  (claimed: import("./run-store.js").ExecutionRecord, operation: string): string | undefined
} = Function.dual(2, (claimed: import("./run-store.js").ExecutionRecord, operation: string): string | undefined =>
  claimed.suspension?._tag === "@batonfx/core/ProgramSuspended" &&
  claimed.suspension.operation === operation &&
  claimed.suspension.reason === "approval" &&
  claimed.resolution?._tag === "Denied"
    ? (claimed.resolution.reason ?? "approval denied")
    : undefined,
)
