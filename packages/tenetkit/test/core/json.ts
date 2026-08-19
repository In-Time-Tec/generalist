import { Schema } from "effect"

export const Json = {
  parse: Schema.decodeSync(Schema.fromJsonString(Schema.Unknown)),
  stringify: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown)),
}
