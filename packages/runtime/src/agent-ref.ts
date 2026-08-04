import { AgentRef as CoreAgentRef } from "@batonfx/core"
import { Schema } from "effect"

export const AgentRef = CoreAgentRef.AgentRef
export type AgentRef = CoreAgentRef.AgentRef

export const make = (input: { readonly id: string; readonly version: string; readonly digest: string }): AgentRef =>
  Schema.decodeUnknownSync(AgentRef)(input)

export const encode = CoreAgentRef.encode
export const decode = CoreAgentRef.decode
