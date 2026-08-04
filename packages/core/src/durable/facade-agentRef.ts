type AgentRefFacade = typeof import("./agent-ref.js")

import {
  AgentRef as AgentRef_AgentRef,
  AgentManifest as AgentRef_AgentManifest,
  AgentRefVersionMismatch as AgentRef_AgentRefVersionMismatch,
  digestManifest as AgentRef_digestManifest,
  make as AgentRef_make,
  manifestFromAgent as AgentRef_manifestFromAgent,
  fromAgent as AgentRef_fromAgent,
  matches as AgentRef_matches,
  requireMatch as AgentRef_requireMatch,
  encode as AgentRef_encode,
  decode as AgentRef_decode,
  encodeManifest as AgentRef_encodeManifest,
  decodeManifest as AgentRef_decodeManifest,
  equivalentManifests as AgentRef_equivalentManifests,
} from "./agent-ref.js"
export const AgentRef = {
  AgentRef: AgentRef_AgentRef,
  AgentManifest: AgentRef_AgentManifest,
  AgentRefVersionMismatch: AgentRef_AgentRefVersionMismatch,
  digestManifest: AgentRef_digestManifest,
  make: AgentRef_make,
  manifestFromAgent: AgentRef_manifestFromAgent,
  fromAgent: AgentRef_fromAgent,
  matches: AgentRef_matches,
  requireMatch: AgentRef_requireMatch,
  encode: AgentRef_encode,
  decode: AgentRef_decode,
  encodeManifest: AgentRef_encodeManifest,
  decodeManifest: AgentRef_decodeManifest,
  equivalentManifests: AgentRef_equivalentManifests,
} as AgentRefFacade
export namespace AgentRef {
  export type AgentRef = import("./agent-ref.js").AgentRef
  export type AgentManifest = import("./agent-ref.js").AgentManifest
  export type AgentRefVersionMismatch = import("./agent-ref.js").AgentRefVersionMismatch
  export type digestManifest = typeof import("./agent-ref.js").digestManifest
  export type make = typeof import("./agent-ref.js").make
  export type manifestFromAgent = typeof import("./agent-ref.js").manifestFromAgent
  export type fromAgent = typeof import("./agent-ref.js").fromAgent
  export type matches = typeof import("./agent-ref.js").matches
  export type requireMatch = typeof import("./agent-ref.js").requireMatch
  export type encode = typeof import("./agent-ref.js").encode
  export type decode = typeof import("./agent-ref.js").decode
  export type encodeManifest = typeof import("./agent-ref.js").encodeManifest
  export type decodeManifest = typeof import("./agent-ref.js").decodeManifest
  export type equivalentManifests = typeof import("./agent-ref.js").equivalentManifests
}
