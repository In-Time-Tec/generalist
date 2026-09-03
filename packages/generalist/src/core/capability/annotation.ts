import { Context, Option, Schema } from "effect"
import type { Tool } from "effect/unstable/ai"

class UntaintedArguments extends Context.Service<UntaintedArguments, ReadonlyArray<string>>()(
  "generalist/core/capability/annotation/UntaintedArguments",
) {}

/** Require the named model-authored arguments to have no tainted tool-result provenance. */
export const requireUntainted =
  (arguments_: ReadonlyArray<string>) =>
  <
    Name extends string,
    Config extends {
      readonly parameters: Schema.Constraint
      readonly success: Schema.Constraint
      readonly failure: Schema.Constraint
      readonly failureMode: Tool.FailureMode
    },
    Requirements,
  >(
    tool: Tool.Tool<Name, Config, Requirements>,
  ): Tool.Tool<Name, Config, Requirements> =>
    tool.annotate(UntaintedArguments, [...arguments_])

/** @internal Read a tool's untainted-argument declaration at the capability enforcement boundary. */
export const requiredUntaintedArguments = (tool: Tool.Any): ReadonlyArray<string> =>
  Option.getOrElse(Context.getOption(tool.annotations, UntaintedArguments), () => [])
