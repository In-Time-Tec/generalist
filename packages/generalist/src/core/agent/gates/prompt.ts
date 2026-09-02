import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import type { Result } from "./definition.js"

type ProposedOutput = typeof Schema.Unknown.Type

const stringify = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const render = (output: ProposedOutput): string => {
  try {
    return stringify(output)
  } catch {
    return String(output)
  }
}

export const verifierPrompt = (output: ProposedOutput): Prompt.Prompt =>
  Prompt.make(
    [
      "Independently verify the proposed completion.",
      "Return a score from 0 to 1 and concise evidence for that score.",
      "You have no access to the proposer's conversation history or tools.",
      "",
      "<proposed_output>",
      render(output),
      "</proposed_output>",
    ].join("\n"),
  )

/** Prompt part used to begin a new turn after a rejected completion. */
export const retryPrompt = (gate: Result): Prompt.Prompt =>
  Prompt.make(
    [
      `Completion gate '${gate.name}' rejected the proposed output.`,
      "Address this evidence, then return a corrected final answer.",
      "",
      "<gate_evidence>",
      render(gate.evidence),
      "</gate_evidence>",
    ].join("\n"),
  )

/** Recover a retry that was checkpointed before its next provider dispatch. */
export const recoveredRetry = (input: {
  readonly agent: { readonly onGateFailure: "retry" | "fail" }
  readonly checkpoint: { readonly state: ProposedOutput } | undefined
}): { readonly prompt: Prompt.Prompt; readonly turn: number } | undefined => {
  if (input.agent.onGateFailure !== "retry" || input.checkpoint === undefined) return undefined
  const state = Schema.decodeUnknownOption(LoopDriverState)(input.checkpoint.state)
  if (state._tag === "None") return undefined
  const latest = state.value.gates?.at(-1)
  if (latest === undefined || latest.result.verdict !== "fail") return undefined
  return { prompt: retryPrompt(latest.result), turn: latest.turn + 1 }
}
