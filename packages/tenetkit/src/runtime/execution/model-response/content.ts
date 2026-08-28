import { Session } from "../../../core/context/public/session.js"
import { Schema } from "effect"
import { Response } from "effect/unstable/ai"

export const decodeAuthoredModelResponseContent = (
  input: typeof Session.ModelResponseContent.Encoded,
): Session.ModelResponseEntry["content"] =>
  Schema.decodeSync(Session.ModelResponseContent)(input).map((part) => {
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
