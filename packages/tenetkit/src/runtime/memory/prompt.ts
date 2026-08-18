import { Prompt } from "effect/unstable/ai"

export const normalizePrompt = (prompt: Prompt.Prompt | Prompt.RawInput): Prompt.Prompt =>
  Prompt.isPrompt(prompt) ? prompt : Prompt.make(prompt)
