import type { ToolOrigin } from "../agent/agent-event.js"
import type { Dispatch } from "../tools/tool-registry.js"

export const dispatchForOrigin = (origin: ToolOrigin): Dispatch => {
  if (origin._tag === "Handoff" && origin.mode === "same-run") return "Handoff"
  return "Static"
}
