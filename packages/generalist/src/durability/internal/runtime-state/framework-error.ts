import { Schema } from "effect"
import { Denied as NestedOperationDenied } from "../../../core/tools/nested-operation.js"
import { RunError } from "../../../core/agent/run/error.js"
import { Denied as CapabilityDenied } from "../../../core/capability/errors.js"
import { RunFailure } from "../../../runtime/run.js"
import { HookFailed } from "../../../hooks/index.js"

/** HookFailed is both a terminal RunFailure and an Agent RunError; keep one shared member. */
export const FrameworkError = Schema.Union([
  ...RunFailure.members.filter((member) => member !== HookFailed),
  ...RunError.members,
  NestedOperationDenied,
  CapabilityDenied,
]).pipe(Schema.toTaggedUnion("_tag"))
