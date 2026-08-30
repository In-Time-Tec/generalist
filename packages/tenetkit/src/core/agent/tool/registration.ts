import { Effect, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import type { RunError, RunOptions, RunResult, RunRequirements } from "../service.js"

export class RegistrationError extends Schema.TaggedError<RegistrationError>()("tenetkit/core/RegistrationError", {
  agent: Schema.String,
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

export interface Registration<Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>, R = never> {
  readonly name: string
  readonly run: <O extends RunOptions>(
    options: O,
  ) => Effect.Effect<
    RunResult<O>,
    RunError | RegistrationError,
    Exclude<Exclude<RunRequirements<Tools, R, O>, R>, import("effect/Scope").Scope>
  >
  readonly requirements: (value: R) => R
}
