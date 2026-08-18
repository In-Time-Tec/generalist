import {
  Divergence as SessionSync_Divergence,
  Diagnostics as SessionSync_Diagnostics,
  coalesceAdjacentText as SessionSync_coalesceAdjacentText,
  equivalentMessages as SessionSync_equivalentMessages,
  diagnose as SessionSync_diagnose,
} from "./session-sync.js"
export const SessionSync = {
  Divergence: SessionSync_Divergence,
  Diagnostics: SessionSync_Diagnostics,
  coalesceAdjacentText: SessionSync_coalesceAdjacentText,
  equivalentMessages: SessionSync_equivalentMessages,
  diagnose: SessionSync_diagnose,
} as typeof import("./session-sync.js")
export namespace SessionSync {
  export type Divergence = import("./session-sync.js").Divergence
  export type Diagnostics = import("./session-sync.js").Diagnostics
  export type coalesceAdjacentText = typeof import("./session-sync.js").coalesceAdjacentText
  export type equivalentMessages = typeof import("./session-sync.js").equivalentMessages
  export type diagnose = typeof import("./session-sync.js").diagnose
}
