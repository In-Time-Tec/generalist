import { Schema } from "effect"

/** Commands retained by the UI boundary; canonical transport currently accepts Cancel only. */
export const AgentCommand = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("SendMessage"), sessionId: Schema.String, prompt: Schema.String }),
  Schema.Struct({
    _tag: Schema.tag("ResolveApproval"),
    sessionId: Schema.String,
    token: Schema.String,
    decision: Schema.Union([
      Schema.Struct({ _tag: Schema.tag("Approved") }),
      Schema.Struct({ _tag: Schema.tag("Denied"), reason: Schema.optionalKey(Schema.String) }),
    ]),
  }),
  Schema.Struct({ _tag: Schema.tag("Cancel"), sessionId: Schema.String }),
])

export type AgentCommand = typeof AgentCommand.Type
export type ClientApproval = Extract<AgentCommand, { readonly _tag: "ResolveApproval" }>["decision"]
