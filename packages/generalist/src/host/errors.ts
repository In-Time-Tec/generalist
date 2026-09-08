import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"

/** An untyped Host start input did not satisfy the configured Agent's input Schema. */
export class AgentInputInvalid extends ActionableTaggedError<AgentInputInvalid>()("generalist/host/AgentInputInvalid", {
  name: Schema.String,
  message: Schema.String,
  hint: errorHint("Send input that satisfies the configured Agent's input Schema."),
}) {}

/** A Run start used an Agent that was not configured on this host. */
export class AgentNotRegistered extends ActionableTaggedError<AgentNotRegistered>()(
  "generalist/host/AgentNotRegistered",
  {
    name: Schema.String,
    hint: errorHint("Pass an Agent from the registry supplied to Host.make."),
  },
) {}

/** A plugin name was declared more than once in one host. */
export class PluginNameConflict extends ActionableTaggedError<PluginNameConflict>()(
  "generalist/host/PluginNameConflict",
  {
    name: Schema.String,
    hint: errorHint("Give each host plugin a unique name."),
  },
) {}

/** Two host declarations attempted to install the same static tool name. */
export class PluginToolConflict extends ActionableTaggedError<PluginToolConflict>()(
  "generalist/host/PluginToolConflict",
  {
    name: Schema.String,
    sources: Schema.Array(Schema.String),
    hint: errorHint("Rename or remove one of the colliding static tools."),
  },
) {}

export type MakeError =
  | import("../runtime/errors.js").DuplicateAgent
  | PluginNameConflict
  | PluginToolConflict
  | import("../runtime/errors.js").ExecutableRegistrationInvalid
  | import("../runtime/errors.js").TreePolicyInvalid
  | import("../runtime/errors.js").RuntimeUnavailable
  | import("../durability/errors.js").DurabilityFailure
