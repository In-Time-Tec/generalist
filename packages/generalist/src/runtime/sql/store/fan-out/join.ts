import type { FanOutJoin } from "../../../child/fan-out.js"
import type { RunEvent } from "../../../run/event.js"
import type { decodeMember } from "./rows.js"

type DecodedMember = ReturnType<typeof decodeMember>

const terminalMemberStatus = (tag: RunEvent["_tag"]) => {
  if (tag === "RunCompleted") return "succeeded"
  return tag === "RunFailed" ? "failed" : "cancelled"
}

const joinedStatus = (
  join: FanOutJoin,
  counts: {
    readonly succeeded: number
    readonly failed: number
    readonly cancelled: number
    readonly unsettled: number
  },
): "succeeded" | "failed" | undefined => {
  switch (join._tag) {
    case "AllSuccess":
      if (counts.failed + counts.cancelled > 0) return "failed"
      return counts.unsettled === 0 ? "succeeded" : undefined
    case "AllSettled":
    case "BestEffort":
      return counts.unsettled === 0 ? "succeeded" : undefined
    case "FirstSuccess":
      if (counts.succeeded > 0) return "succeeded"
      return counts.unsettled === 0 ? "failed" : undefined
    case "Quorum":
      if (counts.succeeded >= join.required) return "succeeded"
      return counts.succeeded + counts.unsettled < join.required ? "failed" : undefined
  }
}

const remainderActions = (members: ReadonlyArray<DecodedMember>, remainder: "await" | "abandon" | "request-cancel") =>
  remainder === "await"
    ? []
    : members
        .filter((member) => member.status === "pending" || member.status === "running")
        .map((member) => ({
          childRunId: member.childRunId,
          action: remainder === "abandon" ? ("abandoned" as const) : ("cancellation-requested" as const),
        }))

export const FanOutJoinResolution = { joinedStatus, remainderActions, terminalMemberStatus }
