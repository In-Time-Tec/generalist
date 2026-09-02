import { Effect, Predicate, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { AgentError } from "../event.js"

/** @internal Encode an Agent input Schema value into the Effect AI prompt representation. */
export const encode = <InputCodec extends Schema.Top>(
  schema: InputCodec,
  input: InputCodec["Type"],
): Effect.Effect<Prompt.RawInput, AgentError, InputCodec["EncodingServices"]> =>
  Schema.encodeEffect(schema)(input).pipe(
    Effect.flatMap((encoded) =>
      Predicate.isString(encoded) || Prompt.isPrompt(encoded)
        ? Effect.succeed<Prompt.RawInput>(encoded)
        : Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Json))(encoded),
    ),
    Effect.mapError((error) =>
      AgentError.make({ message: `Agent input cannot be encoded: ${String(error)}`, turn: 0 }),
    ),
  )
