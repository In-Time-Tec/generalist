import { Effect, Function, Schema } from "effect"
import type { Any as AnyAgent } from "../../core/agent/lifecycle/definition.js"
import {
  DeclarationError,
  validateOptions,
  type AnyOptions,
  type ValidatedOptions,
} from "../../core/program/code-mode-declaration.js"

/** @internal Immutable declaration snapshot retained by one registered revision. */
export type ValidatedDeclaration = ValidatedOptions

/** @internal Validate without invoking any declared capability or executor. */
export const validate: {
  (options: AnyOptions): (agent: AnyAgent) => Effect.Effect<ValidatedDeclaration, DeclarationError>
  (agent: AnyAgent, options: AnyOptions): Effect.Effect<ValidatedDeclaration, DeclarationError>
} = Function.dual(
  2,
  (agent: AnyAgent, options: AnyOptions): Effect.Effect<ValidatedDeclaration, DeclarationError> =>
    Effect.try({
      try: () => validateOptions(agent.toolkit, options),
      catch: (error) =>
        Schema.is(DeclarationError)(error)
          ? error
          : DeclarationError.make({ field: "executor", reason: "identity-invalid" }),
    }),
)
