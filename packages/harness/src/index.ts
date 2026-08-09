import {
  AppliedRefinementEdit as HarnessEntry_AppliedRefinementEdit,
  AuthoredCreateEdit as HarnessEntry_AuthoredCreateEdit,
  AuthoredEdit as HarnessEntry_AuthoredEdit,
  AuthoredProposal as HarnessEntry_AuthoredProposal,
  AuthoredUpdateEdit as HarnessEntry_AuthoredUpdateEdit,
  CreateEdit as HarnessEntry_CreateEdit,
  DeleteEdit as HarnessEntry_DeleteEdit,
  HarnessEntry as HarnessEntry_HarnessEntry,
  HarnessEntryValue as HarnessEntry_HarnessEntryValue,
  HarnessId as HarnessEntry_HarnessId,
  HarnessInstant as HarnessEntry_HarnessInstant,
  HarnessKind as HarnessEntry_HarnessKind,
  HarnessRevision as HarnessEntry_HarnessRevision,
  HarnessScope as HarnessEntry_HarnessScope,
  HarnessSnapshotId as HarnessEntry_HarnessSnapshotId,
  HarnessVersion as HarnessEntry_HarnessVersion,
  RefinementEdit as HarnessEntry_RefinementEdit,
  RefinementEvent as HarnessEntry_RefinementEvent,
  RefinementProposal as HarnessEntry_RefinementProposal,
  UpdateEdit as HarnessEntry_UpdateEdit,
  editKey as HarnessEntry_editKey,
  kinds as HarnessEntry_kinds,
  revision as HarnessEntry_revision,
  value as HarnessEntry_value,
} from "./harness/entry.js"
export const HarnessEntry = {
  AppliedRefinementEdit: HarnessEntry_AppliedRefinementEdit,
  AuthoredCreateEdit: HarnessEntry_AuthoredCreateEdit,
  AuthoredEdit: HarnessEntry_AuthoredEdit,
  AuthoredProposal: HarnessEntry_AuthoredProposal,
  AuthoredUpdateEdit: HarnessEntry_AuthoredUpdateEdit,
  CreateEdit: HarnessEntry_CreateEdit,
  DeleteEdit: HarnessEntry_DeleteEdit,
  HarnessEntry: HarnessEntry_HarnessEntry,
  HarnessEntryValue: HarnessEntry_HarnessEntryValue,
  HarnessId: HarnessEntry_HarnessId,
  HarnessInstant: HarnessEntry_HarnessInstant,
  HarnessKind: HarnessEntry_HarnessKind,
  HarnessRevision: HarnessEntry_HarnessRevision,
  HarnessScope: HarnessEntry_HarnessScope,
  HarnessSnapshotId: HarnessEntry_HarnessSnapshotId,
  HarnessVersion: HarnessEntry_HarnessVersion,
  RefinementEdit: HarnessEntry_RefinementEdit,
  RefinementEvent: HarnessEntry_RefinementEvent,
  RefinementProposal: HarnessEntry_RefinementProposal,
  UpdateEdit: HarnessEntry_UpdateEdit,
  editKey: HarnessEntry_editKey,
  kinds: HarnessEntry_kinds,
  revision: HarnessEntry_revision,
  value: HarnessEntry_value,
} as typeof import("./harness/entry.js")
export namespace HarnessEntry {
  export type AppliedRefinementEdit = import("./harness/entry.js").AppliedRefinementEdit
  export type AuthoredCreateEdit = import("./harness/entry.js").AuthoredCreateEdit
  export type AuthoredEdit = import("./harness/entry.js").AuthoredEdit
  export type AuthoredProposal = import("./harness/entry.js").AuthoredProposal
  export type AuthoredRefinementProposal = import("./harness/entry.js").AuthoredRefinementProposal
  export type AuthoredUpdateEdit = import("./harness/entry.js").AuthoredUpdateEdit
  export type CreateEdit = import("./harness/entry.js").CreateEdit
  export type DeleteEdit = import("./harness/entry.js").DeleteEdit
  export type HarnessEntry = import("./harness/entry.js").HarnessEntry
  export type HarnessEntryValue = import("./harness/entry.js").HarnessEntryValue
  export type HarnessId = import("./harness/entry.js").HarnessId
  export type HarnessInstant = import("./harness/entry.js").HarnessInstant
  export type HarnessKind = import("./harness/entry.js").HarnessKind
  export type HarnessRevision = import("./harness/entry.js").HarnessRevision
  export type HarnessScope = import("./harness/entry.js").HarnessScope
  export type HarnessSnapshotId = import("./harness/entry.js").HarnessSnapshotId
  export type HarnessVersion = import("./harness/entry.js").HarnessVersion
  export type RefinementEdit = import("./harness/entry.js").RefinementEdit
  export type RefinementEvent = import("./harness/entry.js").RefinementEvent
  export type RefinementProposal = import("./harness/entry.js").RefinementProposal
  export type UpdateEdit = import("./harness/entry.js").UpdateEdit
  export type editKey = typeof import("./harness/entry.js").editKey
  export type revision = typeof import("./harness/entry.js").revision
  export type value = typeof import("./harness/entry.js").value
}
import {
  AuthorshipRejected as Authorship_AuthorshipRejected,
  AuthorshipRejection as Authorship_AuthorshipRejection,
  authorProposal as Authorship_authorProposal,
  isAuthored as Authorship_isAuthored,
} from "./harness/authorship.js"
export const Authorship = {
  AuthorshipRejected: Authorship_AuthorshipRejected,
  AuthorshipRejection: Authorship_AuthorshipRejection,
  authorProposal: Authorship_authorProposal,
  isAuthored: Authorship_isAuthored,
} as typeof import("./harness/authorship.js")
export namespace Authorship {
  export type AuthorshipRejected = import("./harness/authorship.js").AuthorshipRejected
  export type AuthorshipRejection = import("./harness/authorship.js").AuthorshipRejection
  export type authorProposal = typeof import("./harness/authorship.js").authorProposal
  export type isAuthored = typeof import("./harness/authorship.js").isAuthored
}
import {
  HarnessEntries as HarnessState_HarnessEntries,
  HarnessState as HarnessState_HarnessState,
  allEntries as HarnessState_allEntries,
  empty as HarnessState_empty,
  findEntry as HarnessState_findEntry,
  make as HarnessState_make,
  snapshotId as HarnessState_snapshotId,
  withEntries as HarnessState_withEntries,
} from "./harness/state.js"
export const HarnessState = {
  HarnessEntries: HarnessState_HarnessEntries,
  HarnessState: HarnessState_HarnessState,
  allEntries: HarnessState_allEntries,
  empty: HarnessState_empty,
  findEntry: HarnessState_findEntry,
  make: HarnessState_make,
  snapshotId: HarnessState_snapshotId,
  withEntries: HarnessState_withEntries,
} as typeof import("./harness/state.js")
export namespace HarnessState {
  export type HarnessEntries = import("./harness/state.js").HarnessEntries
  export type HarnessState = import("./harness/state.js").HarnessState
  export type allEntries = typeof import("./harness/state.js").allEntries
  export type empty = typeof import("./harness/state.js").empty
  export type findEntry = typeof import("./harness/state.js").findEntry
  export type make = typeof import("./harness/state.js").make
  export type snapshotId = typeof import("./harness/state.js").snapshotId
  export type withEntries = typeof import("./harness/state.js").withEntries
}
import {
  RefinementRejected as Refinement_RefinementRejected,
  RefinementRejection as Refinement_RefinementRejection,
  RefinementResult as Refinement_RefinementResult,
  applyProposal as Refinement_applyProposal,
  applyTrustedProposal as Refinement_applyTrustedProposal,
  rollbackProposal as Refinement_rollbackProposal,
  rollbackTarget as Refinement_rollbackTarget,
} from "./harness/refinement.js"
export const Refinement = {
  RefinementRejected: Refinement_RefinementRejected,
  RefinementRejection: Refinement_RefinementRejection,
  RefinementResult: Refinement_RefinementResult,
  applyProposal: Refinement_applyProposal,
  applyTrustedProposal: Refinement_applyTrustedProposal,
  rollbackProposal: Refinement_rollbackProposal,
  rollbackTarget: Refinement_rollbackTarget,
} as typeof import("./harness/refinement.js")
export namespace Refinement {
  export type ApplyOptions = import("./harness/refinement.js").ApplyOptions
  export type RefinementRejected = import("./harness/refinement.js").RefinementRejected
  export type RefinementRejection = import("./harness/refinement.js").RefinementRejection
  export type RefinementResult = import("./harness/refinement.js").RefinementResult
  export type RollbackOptions = import("./harness/refinement.js").RollbackOptions
  export type applyProposal = typeof import("./harness/refinement.js").applyProposal
  export type applyTrustedProposal = typeof import("./harness/refinement.js").applyTrustedProposal
  export type rollbackProposal = typeof import("./harness/refinement.js").rollbackProposal
  export type rollbackTarget = typeof import("./harness/refinement.js").rollbackTarget
}
import { mergeStates as HarnessMerge_mergeStates } from "./harness/merge.js"
export const HarnessMerge = { mergeStates: HarnessMerge_mergeStates } as typeof import("./harness/merge.js")
export namespace HarnessMerge {
  export type mergeStates = typeof import("./harness/merge.js").mergeStates
}
import {
  defaultOverviewOptions as HarnessOverview_defaultOverviewOptions,
  formatOverview as HarnessOverview_formatOverview,
} from "./harness/overview.js"
export const HarnessOverview = {
  defaultOverviewOptions: HarnessOverview_defaultOverviewOptions,
  formatOverview: HarnessOverview_formatOverview,
} as typeof import("./harness/overview.js")
export namespace HarnessOverview {
  export type OverviewOptions = import("./harness/overview.js").OverviewOptions
  export type defaultOverviewOptions = typeof import("./harness/overview.js").defaultOverviewOptions
  export type formatOverview = typeof import("./harness/overview.js").formatOverview
}
import {
  CODEC as HarnessSnapshot_CODEC,
  HarnessSnapshot as HarnessSnapshot_HarnessSnapshot,
  SnapshotInvalid as HarnessSnapshot_SnapshotInvalid,
  SnapshotMismatch as HarnessSnapshot_SnapshotMismatch,
  SnapshotPayload as HarnessSnapshot_SnapshotPayload,
  VERSION as HarnessSnapshot_VERSION,
  decode as HarnessSnapshot_decode,
  encode as HarnessSnapshot_encode,
  snapshot as HarnessSnapshot_snapshot,
} from "./harness/snapshot.js"
export const HarnessSnapshot = {
  CODEC: HarnessSnapshot_CODEC,
  HarnessSnapshot: HarnessSnapshot_HarnessSnapshot,
  SnapshotInvalid: HarnessSnapshot_SnapshotInvalid,
  SnapshotMismatch: HarnessSnapshot_SnapshotMismatch,
  SnapshotPayload: HarnessSnapshot_SnapshotPayload,
  VERSION: HarnessSnapshot_VERSION,
  decode: HarnessSnapshot_decode,
  encode: HarnessSnapshot_encode,
  snapshot: HarnessSnapshot_snapshot,
} as typeof import("./harness/snapshot.js")
export namespace HarnessSnapshot {
  export type HarnessSnapshot = import("./harness/snapshot.js").HarnessSnapshot
  export type SnapshotInvalid = import("./harness/snapshot.js").SnapshotInvalid
  export type SnapshotMismatch = import("./harness/snapshot.js").SnapshotMismatch
  export type SnapshotPayload = import("./harness/snapshot.js").SnapshotPayload
  export type decode = typeof import("./harness/snapshot.js").decode
  export type encode = typeof import("./harness/snapshot.js").encode
  export type snapshot = typeof import("./harness/snapshot.js").snapshot
}
import { registration as HarnessRegistration_registration } from "./harness/registration.js"
export const HarnessRegistration = {
  registration: HarnessRegistration_registration,
} as typeof import("./harness/registration.js")
export namespace HarnessRegistration {
  export type PinnedRegistration = import("./harness/registration.js").PinnedRegistration
  export type registration = typeof import("./harness/registration.js").registration
}
import {
  HarnessStore as HarnessStore_HarnessStore,
  HarnessStoreError as HarnessStore_HarnessStoreError,
  HarnessStoreRejection as HarnessStore_HarnessStoreRejection,
  layerMemory as HarnessStore_layerMemory,
  layerTest as HarnessStore_layerTest,
} from "./harness/store.js"
export const HarnessStore = {
  HarnessStore: HarnessStore_HarnessStore,
  HarnessStoreError: HarnessStore_HarnessStoreError,
  HarnessStoreRejection: HarnessStore_HarnessStoreRejection,
  layerMemory: HarnessStore_layerMemory,
  layerTest: HarnessStore_layerTest,
} as typeof import("./harness/store.js")
export namespace HarnessStore {
  export type HarnessStore = import("./harness/store.js").HarnessStore
  export type HarnessStoreError = import("./harness/store.js").HarnessStoreError
  export type Interface = import("./harness/store.js").Interface
  export type HarnessStoreRejection = import("./harness/store.js").HarnessStoreRejection
  export type layerMemory = typeof import("./harness/store.js").layerMemory
  export type layerTest = typeof import("./harness/store.js").layerTest
}
import {
  make as FileSystemHarnessStore_make,
  layer as FileSystemHarnessStore_layer,
} from "./harness/store-file-system.js"
export const FileSystemHarnessStore = {
  make: FileSystemHarnessStore_make,
  layer: FileSystemHarnessStore_layer,
} as typeof import("./harness/store-file-system.js")
export namespace FileSystemHarnessStore {
  export type Options = import("./harness/store-file-system.js").Options
  export type make = typeof import("./harness/store-file-system.js").make
  export type layer = typeof import("./harness/store-file-system.js").layer
}
