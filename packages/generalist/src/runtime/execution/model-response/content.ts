import { ModelResponseContent, type ModelResponseEntry } from "../../../core/context/session.js"
import { Schema } from "effect"
import { Response } from "effect/unstable/ai"
import { promptFromResponseParts } from "../../../media/prompt.js"

export const decodeAuthoredModelResponseContent = (
  input: typeof ModelResponseContent.Encoded,
): ModelResponseEntry["content"] => {
  const content = Schema.decodeSync(ModelResponseContent)(input).map((part) => {
    if (part.type === "tool-call") {
      return Response.makePart("tool-call", {
        id: part.id,
        name: part.name,
        params: part.params,
        providerExecuted: part.providerExecuted,
        metadata: part.metadata,
      })
    }
    if (part.type === "tool-result") {
      return Response.makePart("tool-result", {
        id: part.id,
        name: part.name,
        result: part.result,
        encodedResult: part.encodedResult,
        isFailure: part.isFailure,
        providerExecuted: part.providerExecuted,
        preliminary: part.preliminary,
        metadata: part.metadata,
      })
    }
    return part
  })
  const prompt = promptFromResponseParts(content)
  if (prompt.content.length !== 1 || prompt.content[0]?.role !== "assistant") {
    throw new TypeError("model response did not project one assistant message")
  }
  return content
}
