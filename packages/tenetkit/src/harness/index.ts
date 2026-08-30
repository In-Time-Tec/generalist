import {
  AppliedRefinementEdit as Entry_AppliedRefinementEdit,
  AuthoredCreateEdit as Entry_AuthoredCreateEdit,
  AuthoredEdit as Entry_AuthoredEdit,
  AuthoredProposal as Entry_AuthoredProposal,
  AuthoredUpdateEdit as Entry_AuthoredUpdateEdit,
  CreateEdit as Entry_CreateEdit,
  DeleteEdit as Entry_DeleteEdit,
  GuidanceEntry as Entry_GuidanceEntry,
  GuidanceEntryValue as Entry_GuidanceEntryValue,
  GuidanceId as Entry_GuidanceId,
  GuidanceInstant as Entry_GuidanceInstant,
  GuidanceKind as Entry_GuidanceKind,
  GuidanceRevision as Entry_GuidanceRevision,
  GuidanceScope as Entry_GuidanceScope,
  GuidanceSnapshotId as Entry_GuidanceSnapshotId,
  GuidanceVersion as Entry_GuidanceVersion,
  RefinementEdit as Entry_RefinementEdit,
  RefinementEvent as Entry_RefinementEvent,
  RefinementProposal as Entry_RefinementProposal,
  UpdateEdit as Entry_UpdateEdit,
  editKey as Entry_editKey,
  kinds as Entry_kinds,
  revision as Entry_revision,
  value as Entry_value,
} from "./entry.js"
export const Entry = {
  AppliedRefinementEdit: Entry_AppliedRefinementEdit,
  AuthoredCreateEdit: Entry_AuthoredCreateEdit,
  AuthoredEdit: Entry_AuthoredEdit,
  AuthoredProposal: Entry_AuthoredProposal,
  AuthoredUpdateEdit: Entry_AuthoredUpdateEdit,
  CreateEdit: Entry_CreateEdit,
  DeleteEdit: Entry_DeleteEdit,
  GuidanceEntry: Entry_GuidanceEntry,
  GuidanceEntryValue: Entry_GuidanceEntryValue,
  GuidanceId: Entry_GuidanceId,
  GuidanceInstant: Entry_GuidanceInstant,
  GuidanceKind: Entry_GuidanceKind,
  GuidanceRevision: Entry_GuidanceRevision,
  GuidanceScope: Entry_GuidanceScope,
  GuidanceSnapshotId: Entry_GuidanceSnapshotId,
  GuidanceVersion: Entry_GuidanceVersion,
  RefinementEdit: Entry_RefinementEdit,
  RefinementEvent: Entry_RefinementEvent,
  RefinementProposal: Entry_RefinementProposal,
  UpdateEdit: Entry_UpdateEdit,
  editKey: Entry_editKey,
  kinds: Entry_kinds,
  revision: Entry_revision,
  value: Entry_value,
} satisfies typeof import("./entry.js")
export namespace Entry {
  export type AppliedRefinementEdit = import("./entry.js").AppliedRefinementEdit
  export type AuthoredCreateEdit = import("./entry.js").AuthoredCreateEdit
  export type AuthoredEdit = import("./entry.js").AuthoredEdit
  export type AuthoredProposal = import("./entry.js").AuthoredProposal
  export type AuthoredRefinementProposal = import("./entry.js").AuthoredRefinementProposal
  export type AuthoredUpdateEdit = import("./entry.js").AuthoredUpdateEdit
  export type CreateEdit = import("./entry.js").CreateEdit
  export type DeleteEdit = import("./entry.js").DeleteEdit
  export type GuidanceEntry = import("./entry.js").GuidanceEntry
  export type GuidanceEntryValue = import("./entry.js").GuidanceEntryValue
  export type GuidanceId = import("./entry.js").GuidanceId
  export type GuidanceInstant = import("./entry.js").GuidanceInstant
  export type GuidanceKind = import("./entry.js").GuidanceKind
  export type GuidanceRevision = import("./entry.js").GuidanceRevision
  export type GuidanceScope = import("./entry.js").GuidanceScope
  export type GuidanceSnapshotId = import("./entry.js").GuidanceSnapshotId
  export type GuidanceVersion = import("./entry.js").GuidanceVersion
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
  GuidanceEntries as State_GuidanceEntries,
  GuidanceState as State_GuidanceState,
  allEntries as State_allEntries,
  empty as State_empty,
  findEntry as State_findEntry,
  make as State_make,
  snapshotId as State_snapshotId,
  withEntries as State_withEntries,
} from "./state.js"
export const State = {
  GuidanceEntries: State_GuidanceEntries,
  GuidanceState: State_GuidanceState,
  allEntries: State_allEntries,
  empty: State_empty,
  findEntry: State_findEntry,
  make: State_make,
  snapshotId: State_snapshotId,
  withEntries: State_withEntries,
} satisfies typeof import("./state.js")
export namespace State {
  export type GuidanceEntries = import("./state.js").GuidanceEntries
  export type GuidanceState = import("./state.js").GuidanceState
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
import { mergeStates as Merge_mergeStates } from "./merge.js"
export const Merge = { mergeStates: Merge_mergeStates } satisfies typeof import("./merge.js")
export namespace Merge {
  export type mergeStates = typeof import("./merge.js").mergeStates
}
import {
  defaultOverviewOptions as Overview_defaultOverviewOptions,
  formatOverview as Overview_formatOverview,
} from "./overview.js"
export const Overview = {
  defaultOverviewOptions: Overview_defaultOverviewOptions,
  formatOverview: Overview_formatOverview,
} satisfies typeof import("./overview.js")
export namespace Overview {
  export type OverviewOptions = import("./overview.js").OverviewOptions
  export type defaultOverviewOptions = typeof import("./overview.js").defaultOverviewOptions
  export type formatOverview = typeof import("./overview.js").formatOverview
}
import {
  CODEC as Snapshot_CODEC,
  GuidanceSnapshot as Snapshot_GuidanceSnapshot,
  SnapshotInvalid as Snapshot_SnapshotInvalid,
  SnapshotMismatch as Snapshot_SnapshotMismatch,
  SnapshotPayload as Snapshot_SnapshotPayload,
  VERSION as Snapshot_VERSION,
  decode as Snapshot_decode,
  encode as Snapshot_encode,
  snapshot as Snapshot_snapshot,
} from "./snapshot.js"
export const Snapshot = {
  CODEC: Snapshot_CODEC,
  GuidanceSnapshot: Snapshot_GuidanceSnapshot,
  SnapshotInvalid: Snapshot_SnapshotInvalid,
  SnapshotMismatch: Snapshot_SnapshotMismatch,
  SnapshotPayload: Snapshot_SnapshotPayload,
  VERSION: Snapshot_VERSION,
  decode: Snapshot_decode,
  encode: Snapshot_encode,
  snapshot: Snapshot_snapshot,
} satisfies typeof import("./snapshot.js")
export namespace Snapshot {
  export type GuidanceSnapshot = import("./snapshot.js").GuidanceSnapshot
  export type SnapshotInvalid = import("./snapshot.js").SnapshotInvalid
  export type SnapshotMismatch = import("./snapshot.js").SnapshotMismatch
  export type SnapshotPayload = import("./snapshot.js").SnapshotPayload
  export type decode = typeof import("./snapshot.js").decode
  export type encode = typeof import("./snapshot.js").encode
  export type snapshot = typeof import("./snapshot.js").snapshot
}
import { registration as Registration_registration } from "./registration.js"
export const Registration = {
  registration: Registration_registration,
} satisfies typeof import("./registration.js")
export namespace Registration {
  export type PinnedRegistration = import("./registration.js").PinnedRegistration
  export type registration = typeof import("./registration.js").registration
}
import {
  Store as Store_Store,
  StoreError as Store_StoreError,
  StoreRejection as Store_StoreRejection,
  layerMemory as Store_layerMemory,
  layerTest as Store_layerTest,
} from "./store.js"
export const Store = {
  Store: Store_Store,
  StoreError: Store_StoreError,
  StoreRejection: Store_StoreRejection,
  layerMemory: Store_layerMemory,
  layerTest: Store_layerTest,
} satisfies typeof import("./store.js")
export namespace Store {
  export type Store = import("./store.js").Store
  export type StoreError = import("./store.js").StoreError
  export type Service = import("./store.js").Service
  export type StoreRejection = import("./store.js").StoreRejection
  export type layerMemory = typeof import("./store.js").layerMemory
  export type layerTest = typeof import("./store.js").layerTest
}
import { make as FileSystemStore_make, layer as FileSystemStore_layer } from "./store-file-system.js"
export const FileSystemStore = {
  make: FileSystemStore_make,
  layer: FileSystemStore_layer,
} satisfies typeof import("./store-file-system.js")
export namespace FileSystemStore {
  export type Options = import("./store-file-system.js").Options
  export type make = typeof import("./store-file-system.js").make
  export type layer = typeof import("./store-file-system.js").layer
}
