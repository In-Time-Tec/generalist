import type { ProgramOperationKind, ProgramOperationOutcome } from "./store.js"

const inputBoundary = {
  tool: "tool-input",
  step: "step-input",
  agent: "agent-input",
  "agent-map": "agent-input",
  "agent-fan-out": "agent-input",
} satisfies Record<Exclude<ProgramOperationKind, "log">, "tool-input" | "step-input" | "agent-input">

const succeeded = <A>(value: A, tokens?: number): ProgramOperationOutcome =>
  tokens === undefined ? { _tag: "Succeeded", value } : { _tag: "Succeeded", value, tokens }

export const OperationOutcome = { inputBoundary, succeeded }
