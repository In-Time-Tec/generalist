import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

export class ProgramHandlerMismatch extends ActionableTaggedError<ProgramHandlerMismatch>()(
  "generalist/core/ProgramHandlerMismatch",
  {
    kind: Schema.Literals(["tool", "step", "agent"]),
    name: Schema.String,
    reason: Schema.String,
    hint: errorHint("Register a handler whose name and schema match the pinned program declaration."),
  },
) {}

export class ProgramIdentityMismatch extends ActionableTaggedError<ProgramIdentityMismatch>()(
  "generalist/core/ProgramIdentityMismatch",
  {
    expected: Schema.String,
    actual: Schema.String,
    hint: errorHint("Execute the request with the exact pinned program identity that created it."),
  },
) {}
