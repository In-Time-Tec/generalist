import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../error-hint.js"
import { CapabilityId, DenialReason, Source } from "./state.js"

export class Invalid extends ActionableTaggedError<Invalid>()("generalist/capability/Invalid", {
  reason: Schema.Literals(["descriptor", "expiry", "handle", "scope"]),
  message: Schema.String,
  hint: errorHint("Use a framework-issued handle with a non-empty scope and a positive finite expiry."),
}) {}

export class AttenuationWidened extends ActionableTaggedError<AttenuationWidened>()(
  "generalist/capability/AttenuationWidened",
  {
    parentId: CapabilityId,
    message: Schema.String,
    hint: errorHint("Choose a scope contained by every dimension of the parent capability."),
  },
) {}

export class Denied extends ActionableTaggedError<Denied>()("generalist/capability/Denied", {
  reason: DenialReason,
  capabilityId: Schema.optionalKey(CapabilityId),
  tool: Schema.optionalKey(Schema.String),
  sources: Schema.Array(Source),
  message: Schema.String,
  hint: errorHint("Use an active handle within its granted scope, or remove tainted values from the operation."),
}) {}
