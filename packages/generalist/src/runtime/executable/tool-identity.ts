import { Context, Schema } from "effect"

export const Identity = Schema.Struct({
  implementation: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
  policy: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
})

/** Application-owned identities for an independently retained Tool implementation and authorization policy. @experimental */
export class ToolIdentity extends Context.Service<ToolIdentity, typeof Identity.Type>()(
  "generalist/runtime/executable/tool-identity/ToolIdentity",
) {}
