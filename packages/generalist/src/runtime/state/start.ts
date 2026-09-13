import type { Prompt } from "effect/unstable/ai"
import type { InitialChildInput, InitialFanOutInput } from "../engine.js"
import { normalizePrompt } from "./prompt.js"
import { inheritance } from "../../core/agent/lifecycle/fan-out.js"

export type NormalizedInitialChild = Omit<InitialChildInput, "prompt"> & { readonly prompt: Prompt.Prompt }

export const normalizeInitialChild = (child: InitialChildInput): NormalizedInitialChild => ({
  ...child,
  prompt: normalizePrompt(child.prompt),
})

export const normalizeInitialFanOut = (fanOut: InitialFanOutInput) => ({
  ...fanOut,
  members: fanOut.members.map((member) => ({
    ...member,
    prompt: normalizePrompt(member.prompt),
    inherit: inheritance(member.inherit),
  })),
})
