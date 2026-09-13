import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../error-hint.js"

const IdentityFields = {
  key: Schema.String,
  instance: Schema.String,
} as const

/** A component declaration is malformed and cannot be registered. @experimental */
export class ComponentDeclarationInvalid extends ActionableTaggedError<ComponentDeclarationInvalid>()(
  "generalist/components/ComponentDeclarationInvalid",
  {
    ...IdentityFields,
    field: Schema.Literals([
      "key",
      "instance",
      "schemaVersion",
      "handler",
      "handlerVersion",
      "scope",
      "maxStateBytes",
      "maxCommandBytes",
      "maxReceiptBytes",
      "initial",
    ]),
    reason: Schema.Literals([
      "malformed-identity",
      "invalid-scope",
      "not-positive-safe-integer",
      "schema-not-json",
      "initial-invalid",
      "duplicate-namespace",
    ]),
    hint: errorHint("Repair the identified declaration field and register one valid component namespace."),
  },
) {}

/** Persisted or transitioned component state is invalid. @experimental */
export class ComponentStateInvalid extends ActionableTaggedError<ComponentStateInvalid>()(
  "generalist/components/ComponentStateInvalid",
  {
    ...IdentityFields,
    reason: Schema.Literals(["decode", "encode", "bounds", "transition"]),
    hint: errorHint("Repair the component state or transition so it satisfies the registered schema and byte bounds."),
  },
) {}

/** A component command cannot be admitted. @experimental */
export class ComponentCommandInvalid extends ActionableTaggedError<ComponentCommandInvalid>()(
  "generalist/components/ComponentCommandInvalid",
  {
    ...IdentityFields,
    reason: Schema.Literals(["mapping", "decode", "encode", "bounds", "identity"]),
    hint: errorHint("Repair the command mapping, identity, schema value, or byte bounds before retrying."),
  },
) {}

/** One stable command identity was reused for a different canonical command. @experimental */
export class ComponentCommandConflict extends ActionableTaggedError<ComponentCommandConflict>()(
  "generalist/components/ComponentCommandConflict",
  {
    ...IdentityFields,
    commandId: Schema.String,
    hint: errorHint("Retry the original immutable command, or use a new command identity for different work."),
  },
) {}

/** The active Run or Session does not own the requested component. @experimental */
export class ComponentAccessDenied extends ActionableTaggedError<ComponentAccessDenied>()(
  "generalist/components/ComponentAccessDenied",
  {
    ...IdentityFields,
    scope: Schema.Literals(["run", "session"]),
    runId: Schema.optionalKey(Schema.String),
    sessionId: Schema.optionalKey(Schema.String),
    hint: errorHint("Use the component from its admitted Run or Session owner."),
  },
) {}

/** The component cannot be used in the current Runtime state. @experimental */
export class ComponentUnavailable extends ActionableTaggedError<ComponentUnavailable>()(
  "generalist/components/ComponentUnavailable",
  {
    ...IdentityFields,
    reason: Schema.Literals(["outside-run", "not-registered", "wrong-version", "persistence"]),
    hint: errorHint(
      "Use the matching registered component inside an active Run; retry the same identity after transient persistence failures.",
    ),
  },
) {}

/** Public failures produced by component reads and commands. @experimental */
export const ComponentFailure = Schema.Union([
  ComponentStateInvalid,
  ComponentCommandInvalid,
  ComponentCommandConflict,
  ComponentAccessDenied,
  ComponentUnavailable,
])
/** Public failures produced by component reads and commands. @experimental */
export type ComponentFailure = typeof ComponentFailure.Type
