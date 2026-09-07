import { Response, type Tool } from "effect/unstable/ai"
import type { AppendInput } from "../../context/session.js"

/** Remove provider transport details before a model response enters durable state. */
export const persistModelResponsePart = <Tools extends Record<string, Tool.Any>>(
  part: Response.Part<Tools>,
): Response.Part<Tools> => {
  switch (part.type) {
    case "response-metadata":
      return Response.makePart("response-metadata", {
        id: part.id,
        modelId: part.modelId,
        timestamp: part.timestamp,
        metadata: part.metadata,
        request: undefined,
      }) as Response.Part<Tools>
    case "finish":
      return Response.makePart("finish", {
        reason: part.reason,
        usage: part.usage,
        metadata: part.metadata,
        response: undefined,
      }) as Response.Part<Tools>
    default:
      return part
  }
}

/** Prepare direct Session input with the same transport privacy contract as model persistence. */
export const prepareSessionAppendInput = (input: AppendInput): AppendInput => {
  if (input._tag !== "ModelResponse") return input
  return {
    ...input,
    content: input.content.map((part) => persistModelResponsePart(part)),
  }
}
