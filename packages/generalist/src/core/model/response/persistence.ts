import type { Response, Tool } from "effect/unstable/ai"
import type { AppendInput } from "../../context/session.js"

/** Remove provider transport details before a model response enters durable state. */
export const persistModelResponsePart = <Tools extends Record<string, Tool.Any>>(
  part: Response.Part<Tools>,
): Response.Part<Tools> => {
  switch (part.type) {
    case "response-metadata":
      return { ...part, request: undefined }
    case "finish":
      return { ...part, response: undefined }
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
