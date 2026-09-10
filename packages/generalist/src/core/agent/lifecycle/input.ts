import { Effect, Predicate, Schema } from "effect"
import { dual } from "effect/Function"
import { Prompt } from "effect/unstable/ai"
import { AgentError } from "../event.js"
import { promptWithRefs } from "../../../media/prompt.js"

interface EncodeFunction {
  <InputValue>(
    input: InputValue,
  ): <InputCodec extends Schema.Top>(
    schema: InputValue extends InputCodec["Type"] ? InputCodec : never,
  ) => Effect.Effect<Prompt.RawInput, AgentError, InputCodec["EncodingServices"]>
  <InputCodec extends Schema.Top>(
    schema: InputCodec,
    input: InputCodec["Type"],
  ): Effect.Effect<Prompt.RawInput, AgentError, InputCodec["EncodingServices"]>
}

/** @internal Encode an Agent input Schema value into the Effect AI prompt representation. */
export const encode: EncodeFunction = dual(
  2,
  <InputCodec extends Schema.Top>(schema: InputCodec, input: InputCodec["Type"]) =>
    Schema.encodeEffect(schema)(input).pipe(
      Effect.flatMap((encoded) =>
        Predicate.isString(encoded) || Prompt.isPrompt(encoded)
          ? Effect.succeed<Prompt.RawInput>(encoded)
          : Schema.decodeUnknownEffect(Schema.Json)(encoded).pipe(
              Effect.flatMap((jsonValue) =>
                Schema.encodeEffect(Schema.fromJsonString(Schema.Json))(jsonValue).pipe(
                  Effect.map((json) => promptWithRefs({ encoded: jsonValue, json })),
                ),
              ),
            ),
      ),
      Effect.mapError((error) =>
        AgentError.make({ message: `Agent input cannot be encoded: ${String(error)}`, turn: 0 }),
      ),
    ),
)
