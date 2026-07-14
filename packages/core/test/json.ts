import { Schema } from "effect"

export const Json = {
  parse: Schema.decodeSync(Schema.UnknownFromJsonString),
  stringify: Schema.encodeSync(Schema.UnknownFromJsonString),
}
