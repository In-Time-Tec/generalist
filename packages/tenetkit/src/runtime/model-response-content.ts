import { Session } from "tenetkit"
import { Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"

export const decodeAuthoredModelResponseContent = (input: unknown): Session.ModelResponseEntry["content"] => {
  const content = Schema.decodeUnknownSync(Session.ModelResponseContent)(input) as Session.ModelResponseEntry["content"]
  const prompt = Prompt.fromResponseParts(content as ReadonlyArray<Response.AnyPart>)
  if (prompt.content.length !== 1 || prompt.content[0]?.role !== "assistant") {
    throw new Error("model response did not project one assistant message")
  }
  return content
}
