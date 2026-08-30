import {
  SessionStoreError as Session_SessionStoreError,
  SessionConflict as Session_SessionConflict,
  SessionDirectory as Session_SessionDirectory,
  acquire as Session_acquire,
  checkpointMatches as Session_checkpointMatches,
  ContextInvalid as Session_ContextInvalid,
  EntryPayload as Session_EntryPayload,
  ModelResponseContent as Session_ModelResponseContent,
  buildContext as Session_buildContext,
  buildMemoryContext as Session_buildMemoryContext,
  unresolvedToolCalls as Session_unresolvedToolCalls,
  validateContext as Session_validateContext,
  layerTest as Session_layerTest,
} from "../session.js"
import { layerMemory as Session_layerMemory } from "../session-memory.js"
export const Session = {
  SessionStoreError: Session_SessionStoreError,
  SessionConflict: Session_SessionConflict,
  SessionDirectory: Session_SessionDirectory,
  acquire: Session_acquire,
  checkpointMatches: Session_checkpointMatches,
  ContextInvalid: Session_ContextInvalid,
  EntryPayload: Session_EntryPayload,
  ModelResponseContent: Session_ModelResponseContent,
  buildContext: Session_buildContext,
  buildMemoryContext: Session_buildMemoryContext,
  unresolvedToolCalls: Session_unresolvedToolCalls,
  validateContext: Session_validateContext,
  layerMemory: Session_layerMemory,
  layerTest: Session_layerTest,
}
export namespace Session {
  export type SessionStoreError = import("../session.js").SessionStoreError
  export type SessionConflict = import("../session.js").SessionConflict
  export type SessionDirectory = import("../session.js").SessionDirectory
  export type acquire = typeof import("../session.js").acquire
  export type checkpointMatches = typeof import("../session.js").checkpointMatches
  export type ContextInvalid = import("../session.js").ContextInvalid
  export type EntryPayload = import("../session.js").EntryPayload
  export type ModelResponseContent = typeof import("../session.js").ModelResponseContent
  export type buildContext = typeof import("../session.js").buildContext
  export type buildMemoryContext = typeof import("../session.js").buildMemoryContext
  export type unresolvedToolCalls = typeof import("../session.js").unresolvedToolCalls
  export type validateContext = typeof import("../session.js").validateContext
  export type layerMemory = typeof import("../session-memory.js").layerMemory
  export type layerTest = typeof import("../session.js").layerTest
  export type AppendInput = import("../session.js").AppendInput
  export type AppendOptions = import("../session.js").AppendOptions
  export type BaseEntry = import("../session.js").BaseEntry
  export type BranchSummaryEntry = import("../session.js").BranchSummaryEntry
  export type CheckpointAppend = import("../session.js").CheckpointAppend
  export type CompactionEntry = import("../session.js").CompactionEntry
  export type Entry = import("../session.js").Entry
  export type EntryId = import("../session.js").EntryId
  export type HandoffEntry = import("../session.js").HandoffEntry
  export type Service = import("../session.js").Service
  export type SessionStore = import("../session.js").Service
  export type DirectoryInterface = import("../session.js").DirectoryInterface
  export type MemoryEntry = import("../session.js").MemoryEntry
  export type MessageEntry = import("../session.js").MessageEntry
  export type ModelResponseEntry = import("../session.js").ModelResponseEntry
  export type Metadata = import("../session.js").Metadata
  export type PreparedCheckpoint = import("../session.js").PreparedCheckpoint
  export type SkillEntry = import("../session.js").SkillEntry
  export type SteeringEntry = import("../session.js").SteeringEntry
  export type ToolCallEntry = import("../session.js").ToolCallEntry
  export type ToolResultEntry = import("../session.js").ToolResultEntry
}
