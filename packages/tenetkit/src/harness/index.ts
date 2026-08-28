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
} from "./entry.js"
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
} satisfies typeof import("./entry.js")
export namespace HarnessEntry {
  export type AppliedRefinementEdit = import("./entry.js").AppliedRefinementEdit
  export type AuthoredCreateEdit = import("./entry.js").AuthoredCreateEdit
  export type AuthoredEdit = import("./entry.js").AuthoredEdit
  export type AuthoredProposal = import("./entry.js").AuthoredProposal
  export type AuthoredRefinementProposal = import("./entry.js").AuthoredRefinementProposal
  export type AuthoredUpdateEdit = import("./entry.js").AuthoredUpdateEdit
  export type CreateEdit = import("./entry.js").CreateEdit
  export type DeleteEdit = import("./entry.js").DeleteEdit
  export type HarnessEntry = import("./entry.js").HarnessEntry
  export type HarnessEntryValue = import("./entry.js").HarnessEntryValue
  export type HarnessId = import("./entry.js").HarnessId
  export type HarnessInstant = import("./entry.js").HarnessInstant
  export type HarnessKind = import("./entry.js").HarnessKind
  export type HarnessRevision = import("./entry.js").HarnessRevision
  export type HarnessScope = import("./entry.js").HarnessScope
  export type HarnessSnapshotId = import("./entry.js").HarnessSnapshotId
  export type HarnessVersion = import("./entry.js").HarnessVersion
  export type RefinementEdit = import("./entry.js").RefinementEdit
  export type RefinementEvent = import("./entry.js").RefinementEvent
  export type RefinementProposal = import("./entry.js").RefinementProposal
  export type UpdateEdit = import("./entry.js").UpdateEdit
  export type editKey = typeof import("./entry.js").editKey
  export type revision = typeof import("./entry.js").revision
  export type value = typeof import("./entry.js").value
}
import {
  AuthorshipRejected as Authorship_AuthorshipRejected,
  AuthorshipRejection as Authorship_AuthorshipRejection,
  authorProposal as Authorship_authorProposal,
  isAuthored as Authorship_isAuthored,
} from "./authorship.js"
export const Authorship = {
  AuthorshipRejected: Authorship_AuthorshipRejected,
  AuthorshipRejection: Authorship_AuthorshipRejection,
  authorProposal: Authorship_authorProposal,
  isAuthored: Authorship_isAuthored,
} satisfies typeof import("./authorship.js")
export namespace Authorship {
  export type AuthorshipRejected = import("./authorship.js").AuthorshipRejected
  export type AuthorshipRejection = import("./authorship.js").AuthorshipRejection
  export type authorProposal = typeof import("./authorship.js").authorProposal
  export type isAuthored = typeof import("./authorship.js").isAuthored
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
} from "./state.js"
export const HarnessState = {
  HarnessEntries: HarnessState_HarnessEntries,
  HarnessState: HarnessState_HarnessState,
  allEntries: HarnessState_allEntries,
  empty: HarnessState_empty,
  findEntry: HarnessState_findEntry,
  make: HarnessState_make,
  snapshotId: HarnessState_snapshotId,
  withEntries: HarnessState_withEntries,
} satisfies typeof import("./state.js")
export namespace HarnessState {
  export type HarnessEntries = import("./state.js").HarnessEntries
  export type HarnessState = import("./state.js").HarnessState
  export type allEntries = typeof import("./state.js").allEntries
  export type empty = typeof import("./state.js").empty
  export type findEntry = typeof import("./state.js").findEntry
  export type make = typeof import("./state.js").make
  export type snapshotId = typeof import("./state.js").snapshotId
  export type withEntries = typeof import("./state.js").withEntries
}
import {
  RefinementRejected as Refinement_RefinementRejected,
  RefinementRejection as Refinement_RefinementRejection,
  RefinementResult as Refinement_RefinementResult,
  applyProposal as Refinement_applyProposal,
  applyTrustedProposal as Refinement_applyTrustedProposal,
  isAuthored as Refinement_isAuthored,
  rollbackProposal as Refinement_rollbackProposal,
  rollbackTarget as Refinement_rollbackTarget,
} from "./refinement.js"
export const Refinement = {
  RefinementRejected: Refinement_RefinementRejected,
  RefinementRejection: Refinement_RefinementRejection,
  RefinementResult: Refinement_RefinementResult,
  applyProposal: Refinement_applyProposal,
  applyTrustedProposal: Refinement_applyTrustedProposal,
  isAuthored: Refinement_isAuthored,
  rollbackProposal: Refinement_rollbackProposal,
  rollbackTarget: Refinement_rollbackTarget,
} satisfies typeof import("./refinement.js")
export namespace Refinement {
  export type ApplyOptions = import("./refinement.js").ApplyOptions
  export type RefinementRejected = import("./refinement.js").RefinementRejected
  export type RefinementRejection = import("./refinement.js").RefinementRejection
  export type RefinementResult = import("./refinement.js").RefinementResult
  export type RollbackOptions = import("./refinement.js").RollbackOptions
  export type applyProposal = typeof import("./refinement.js").applyProposal
  export type applyTrustedProposal = typeof import("./refinement.js").applyTrustedProposal
  export type isAuthored = typeof import("./refinement.js").isAuthored
  export type rollbackProposal = typeof import("./refinement.js").rollbackProposal
  export type rollbackTarget = typeof import("./refinement.js").rollbackTarget
}
import { mergeStates as HarnessMerge_mergeStates } from "./merge.js"
export const HarnessMerge = { mergeStates: HarnessMerge_mergeStates } satisfies typeof import("./merge.js")
export namespace HarnessMerge {
  export type mergeStates = typeof import("./merge.js").mergeStates
}
import {
  defaultOverviewOptions as HarnessOverview_defaultOverviewOptions,
  formatOverview as HarnessOverview_formatOverview,
} from "./overview.js"
export const HarnessOverview = {
  defaultOverviewOptions: HarnessOverview_defaultOverviewOptions,
  formatOverview: HarnessOverview_formatOverview,
} satisfies typeof import("./overview.js")
export namespace HarnessOverview {
  export type OverviewOptions = import("./overview.js").OverviewOptions
  export type defaultOverviewOptions = typeof import("./overview.js").defaultOverviewOptions
  export type formatOverview = typeof import("./overview.js").formatOverview
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
} from "./snapshot.js"
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
} satisfies typeof import("./snapshot.js")
export namespace HarnessSnapshot {
  export type HarnessSnapshot = import("./snapshot.js").HarnessSnapshot
  export type SnapshotInvalid = import("./snapshot.js").SnapshotInvalid
  export type SnapshotMismatch = import("./snapshot.js").SnapshotMismatch
  export type SnapshotPayload = import("./snapshot.js").SnapshotPayload
  export type decode = typeof import("./snapshot.js").decode
  export type encode = typeof import("./snapshot.js").encode
  export type snapshot = typeof import("./snapshot.js").snapshot
}
import { registration as HarnessRegistration_registration } from "./registration.js"
export const HarnessRegistration = {
  registration: HarnessRegistration_registration,
} satisfies typeof import("./registration.js")
export namespace HarnessRegistration {
  export type PinnedRegistration = import("./registration.js").PinnedRegistration
  export type registration = typeof import("./registration.js").registration
}
import {
  HarnessStore as HarnessStore_HarnessStore,
  HarnessStoreError as HarnessStore_HarnessStoreError,
  HarnessStoreRejection as HarnessStore_HarnessStoreRejection,
  layerMemory as HarnessStore_layerMemory,
  layerTest as HarnessStore_layerTest,
} from "./store.js"
export const HarnessStore = {
  HarnessStore: HarnessStore_HarnessStore,
  HarnessStoreError: HarnessStore_HarnessStoreError,
  HarnessStoreRejection: HarnessStore_HarnessStoreRejection,
  layerMemory: HarnessStore_layerMemory,
  layerTest: HarnessStore_layerTest,
} satisfies typeof import("./store.js")
export namespace HarnessStore {
  export type HarnessStore = import("./store.js").HarnessStore
  export type HarnessStoreError = import("./store.js").HarnessStoreError
  export type Interface = import("./store.js").Interface
  export type HarnessStoreRejection = import("./store.js").HarnessStoreRejection
  export type layerMemory = typeof import("./store.js").layerMemory
  export type layerTest = typeof import("./store.js").layerTest
}
import { make as FileSystemHarnessStore_make, layer as FileSystemHarnessStore_layer } from "./store-file-system.js"
export const FileSystemHarnessStore = {
  make: FileSystemHarnessStore_make,
  layer: FileSystemHarnessStore_layer,
} satisfies typeof import("./store-file-system.js")
export namespace FileSystemHarnessStore {
  export type Options = import("./store-file-system.js").Options
  export type make = typeof import("./store-file-system.js").make
  export type layer = typeof import("./store-file-system.js").layer
}
