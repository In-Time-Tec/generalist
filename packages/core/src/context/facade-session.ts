import {
  SessionStoreError as Session_SessionStoreError,
  SessionConflict as Session_SessionConflict,
  SessionStore as Session_SessionStore,
  checkpointMatches as Session_checkpointMatches,
  buildContext as Session_buildContext,
  buildMemoryContext as Session_buildMemoryContext,
  layerMemory as Session_layerMemory,
  layerTest as Session_layerTest,
} from "./session.js"
export const Session = {
  SessionStoreError: Session_SessionStoreError,
  SessionConflict: Session_SessionConflict,
  SessionStore: Session_SessionStore,
  checkpointMatches: Session_checkpointMatches,
  buildContext: Session_buildContext,
  buildMemoryContext: Session_buildMemoryContext,
  layerMemory: Session_layerMemory,
  layerTest: Session_layerTest,
} as typeof import("./session.js")
export namespace Session {
  export type SessionStoreError = import("./session.js").SessionStoreError
  export type SessionConflict = import("./session.js").SessionConflict
  export type SessionStore = import("./session.js").SessionStore
  export type checkpointMatches = typeof import("./session.js").checkpointMatches
  export type buildContext = typeof import("./session.js").buildContext
  export type buildMemoryContext = typeof import("./session.js").buildMemoryContext
  export type layerMemory = typeof import("./session.js").layerMemory
  export type layerTest = typeof import("./session.js").layerTest
  export type AppendInput = import("./session.js").AppendInput
  export type AppendOptions = import("./session.js").AppendOptions
  export type BaseEntry = import("./session.js").BaseEntry
  export type BranchSummaryEntry = import("./session.js").BranchSummaryEntry
  export type CheckpointAppend = import("./session.js").CheckpointAppend
  export type CheckpointEntry = import("./session.js").CheckpointEntry
  export type CompactionEntry = import("./session.js").CompactionEntry
  export type Entry = import("./session.js").Entry
  export type EntryId = import("./session.js").EntryId
  export type HandoffEntry = import("./session.js").HandoffEntry
  export type Interface = import("./session.js").Interface
  export type LegacyCompactionEntry = import("./session.js").LegacyCompactionEntry
  export type MemoryEntry = import("./session.js").MemoryEntry
  export type MessageEntry = import("./session.js").MessageEntry
  export type Metadata = import("./session.js").Metadata
  export type PreparedCheckpoint = import("./session.js").PreparedCheckpoint
  export type SkillEntry = import("./session.js").SkillEntry
  export type SteeringEntry = import("./session.js").SteeringEntry
  export type ToolCallEntry = import("./session.js").ToolCallEntry
  export type ToolResultEntry = import("./session.js").ToolResultEntry
}
