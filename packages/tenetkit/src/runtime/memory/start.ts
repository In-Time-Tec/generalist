import type { Prompt } from "effect/unstable/ai"
import type { InitialChildInput, InitialFanOutInput } from "../service.js"
import { normalizePrompt } from "./prompt.js"

export type NormalizedInitialChild = Omit<InitialChildInput, "prompt"> & { readonly prompt: Prompt.Prompt }

export const normalizeInitialChild = (child: InitialChildInput): NormalizedInitialChild => ({
  ...child,
  prompt: normalizePrompt(child.prompt),
})

export const normalizeInitialFanOut = (fanOut: InitialFanOutInput) => ({
  ...fanOut,
  members: fanOut.members.map((member) => ({ ...member, prompt: normalizePrompt(member.prompt) })),
})
