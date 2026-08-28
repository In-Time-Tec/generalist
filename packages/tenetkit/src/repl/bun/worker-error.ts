import { Schema } from "effect"

const Details = Schema.Struct({
  name: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  stack: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
})
type RuntimeValue = typeof Schema.Unknown.Type

/** @experimental Read error fields across the worker's VM realm boundary. */
export const details = (error: RuntimeValue): typeof Details.Type | undefined =>
  Error.isError(error)
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: Schema.decodeUnknownOption(Schema.String)(Object.getOwnPropertyDescriptor(error, "code")?.value).pipe(
          (option) => (option._tag === "Some" ? option.value : undefined),
        ),
      }
    : Schema.decodeUnknownOption(Details)(error).pipe((option) => (option._tag === "Some" ? option.value : undefined))
