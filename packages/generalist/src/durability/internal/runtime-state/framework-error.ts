import { Schema } from "effect"
import { Denied as NestedOperationDenied } from "../../../core/tools/nested-operation.js"
import { RunError } from "../../../core/agent/run/error.js"
import { Denied as CapabilityDenied } from "../../../core/capability/errors.js"
import { RunFailure } from "../../../runtime/run.js"

/** Terminal RunFailure members also present in Agent RunError are included only once. */
const runErrorMembers = new Set<unknown>(RunError.members)
export const FrameworkError = Schema.Union([
  ...RunFailure.members.filter((member) => !runErrorMembers.has(member)),
  ...RunError.members,
  NestedOperationDenied,
  CapabilityDenied,
]).pipe(Schema.toTaggedUnion("_tag"))
