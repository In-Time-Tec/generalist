import { Effect, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import type { InvocationOptions, RunError, RunRequirements } from "../service.js"

export class RegistrationError extends Schema.TaggedError<RegistrationError>()("generalist/core/RegistrationError", {
  agent: Schema.String,
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

export interface Registration<Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>, R = never> {
  readonly name: string
  readonly run: <O extends InvocationOptions>(
    input: string,
    options?: O,
  ) => Effect.Effect<string, RunError | RegistrationError, Exclude<RunRequirements<Tools, R, O>, R>>
  readonly requirements: (value: R) => R
}
