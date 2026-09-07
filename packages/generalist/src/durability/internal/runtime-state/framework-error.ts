import { Schema } from "effect"
import { Denied as NestedOperationDenied } from "../../../core/tools/nested-operation.js"
import { RunError } from "../../../core/agent/run/error.js"
import { Denied as CapabilityDenied } from "../../../core/capability/errors.js"
import { RunFailure } from "../../../runtime/run.js"

export const FrameworkError = Schema.Union([
  ...RunFailure.members,
  ...RunError.members,
  NestedOperationDenied,
  CapabilityDenied,
]).pipe(Schema.toTaggedUnion("_tag"))
