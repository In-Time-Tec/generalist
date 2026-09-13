import type { FailureMode } from "./definition.js"
import type { SandboxService } from "../../../sandbox/service.js"

/** Validate Agent-owned gate configuration while the Agent is constructed. */
export const validateAgentGates = (input: {
  readonly gates: ReadonlyArray<{ readonly _tag: string; readonly name: string }>
  readonly sandbox: SandboxService | undefined
  readonly failureMode: FailureMode
}): void => {
  if (input.failureMode !== "retry" && input.failureMode !== "fail") throw new TypeError("Invalid onGateFailure value")
  const names = new Set<string>()
  for (const gate of input.gates) {
    if (gate.name.length === 0) throw new TypeError("Gate name must not be empty")
    if (names.has(gate.name)) throw new TypeError(`Duplicate gate name: ${gate.name}`)
    names.add(gate.name)
  }
  if (!input.gates.some((gate) => gate._tag === "Command")) return
  if (input.sandbox === undefined) throw new TypeError("Agent command gates require a Sandbox")
  if (!input.sandbox.capabilities.commands.includes("Process")) {
    throw new TypeError("Agent command gates require a Sandbox with the Process capability")
  }
}
