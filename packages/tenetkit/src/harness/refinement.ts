import { Function, Result, Schema } from "effect"
import {
  AppliedRefinementEdit,
  HarnessEntry,
  HarnessId,
  HarnessInstant,
  HarnessSnapshotId,
  RefinementEvent,
  RefinementProposal,
  editKey,
  kinds,
  revision,
  value,
  type AuthoredRefinementProposal,
  type CreateEdit,
  type DeleteEdit,
  type RefinementEdit,
  type UpdateEdit,
} from "./entry.js"
import { HarnessState, findEntry, snapshotId, withEntries } from "./state.js"

/** @experimental Why one proposal cannot be applied to one state. */
export const RefinementRejection = Schema.Literals([
  "baseline-drift",
  "create-existing",
  "delete-missing",
  "duplicate-target",
  "kind-capacity",
  "pinned-revision",
  "rollback-not-newest",
  "update-missing",
  "version-drift",
])
/** @experimental */
export type RefinementRejection = typeof RefinementRejection.Type

/** @experimental One proposal was rejected and no state changed. */
export class RefinementRejected extends Schema.TaggedError<RefinementRejected>()(
  "tenetkit/harness/RefinementRejected",
  {
    reason: RefinementRejection,
    proposal: HarnessId,
    target: Schema.optionalKey(Schema.String),
    message: Schema.String,
  },
) {}

/** @experimental The next state and the durable record of one applied proposal. */
export const RefinementResult = Schema.Struct({ state: HarnessState, event: RefinementEvent })
/** @experimental */
export type RefinementResult = typeof RefinementResult.Type

/** @experimental Bounds enforced while one proposal is applied. */
export interface ApplyOptions {
  readonly maxEntriesPerKind?: number
  readonly maxRefinements?: number
}

interface EditOutcome {
  readonly state: HarnessState
  readonly applied: AppliedRefinementEdit
}

interface RejectionInput {
  reason: RefinementRejection
  proposal: HarnessId
  message: string
  target?: string
}

interface RefinementEventInput {
  proposal: HarnessId
  at: HarnessInstant
  scope: HarnessState["scope"]
  rationale?: string
  source?: string
  before: HarnessSnapshotId
  after: HarnessSnapshotId
  applied: ReadonlyArray<AppliedRefinementEdit>
}

interface InverseDeleteEdit {
  _tag: "Delete"
  kind: CreateEdit["kind"]
  id: HarnessId
  baseVersion?: HarnessEntry["version"]
}

interface InverseUpdateEdit {
  _tag: "Update"
  kind: UpdateEdit["kind"]
  id: HarnessId
  value: ReturnType<typeof value>
  baseVersion?: HarnessEntry["version"]
  revision: ReturnType<typeof revision>
}

interface RollbackProposalInput {
  id: HarnessId
  at: HarnessInstant
  rationale?: string
  source?: string
  baseSnapshot: HarnessSnapshotId
  rollbackOf: HarnessId
  edits: ReadonlyArray<RefinementEdit>
}

/** @experimental Whether every edit of one proposal leaves its revision to the engine. */
export const isAuthored = (proposal: RefinementProposal): boolean =>
  proposal.rollbackOf === undefined &&
  proposal.edits.every((edit: RefinementEdit) => edit._tag === "Delete" || edit.revision === undefined)

const rejection = (
  proposal: HarnessId,
  reason: RefinementRejection,
  message: string,
  target?: string,
): RefinementRejected => {
  const input: RejectionInput = { reason, proposal, message }
  if (target !== undefined) input.target = target
  return RefinementRejected.make(input)
}

const createdEntry = (state: HarnessState, at: HarnessInstant, edit: CreateEdit): HarnessEntry => ({
  id: edit.id,
  kind: edit.kind,
  scope: state.scope,
  ...edit.value,
  createdAt: edit.revision?.createdAt ?? at,
  updatedAt: edit.revision?.updatedAt ?? at,
  version: edit.revision?.version ?? 1,
})

const updatedEntry = (before: HarnessEntry, at: HarnessInstant, edit: UpdateEdit): HarnessEntry => ({
  id: before.id,
  kind: before.kind,
  scope: before.scope,
  ...edit.value,
  createdAt: edit.revision?.createdAt ?? before.createdAt,
  updatedAt: edit.revision?.updatedAt ?? at,
  version: edit.revision?.version ?? before.version + 1,
})

const versionDrift = (
  proposal: HarnessId,
  edit: UpdateEdit | DeleteEdit,
  before: HarnessEntry,
): RefinementRejected | undefined =>
  edit.baseVersion === undefined || edit.baseVersion === before.version
    ? undefined
    : rejection(proposal, "version-drift", `entry version is ${before.version}, not ${edit.baseVersion}`, editKey(edit))

const applyEdit = (
  state: HarnessState,
  proposal: HarnessId,
  at: HarnessInstant,
  edit: RefinementEdit,
): Result.Result<EditOutcome, RefinementRejected> => {
  const before = findEntry(state, edit.kind, edit.id)
  if (edit._tag === "Create") {
    if (before !== undefined) {
      return Result.fail(rejection(proposal, "create-existing", "entry already exists", editKey(edit)))
    }
    const after = createdEntry(state, at, edit)
    return Result.succeed({
      state: withEntries(state, edit.kind, [...state.entries[edit.kind], after]),
      applied: { edit, after },
    })
  }
  if (before === undefined) {
    return Result.fail(
      rejection(
        proposal,
        edit._tag === "Update" ? "update-missing" : "delete-missing",
        "entry does not exist",
        editKey(edit),
      ),
    )
  }
  const drift = versionDrift(proposal, edit, before)
  if (drift !== undefined) return Result.fail(drift)
  if (edit._tag === "Delete") {
    const remaining = state.entries[edit.kind].filter((entry) => entry.id !== edit.id)
    return Result.succeed({ state: withEntries(state, edit.kind, remaining), applied: { edit, before } })
  }
  const after = updatedEntry(before, at, edit)
  const replaced = state.entries[edit.kind].map((entry) => (entry.id === edit.id ? after : entry))
  return Result.succeed({ state: withEntries(state, edit.kind, replaced), applied: { edit, before, after } })
}

const overCapacity = (
  state: HarnessState,
  proposal: HarnessId,
  maxEntriesPerKind: number | undefined,
): RefinementRejected | undefined => {
  if (maxEntriesPerKind === undefined) return undefined
  const kind = kinds.find((candidate) => state.entries[candidate].length > maxEntriesPerKind)
  return kind === undefined
    ? undefined
    : rejection(proposal, "kind-capacity", `${kind} exceeds ${maxEntriesPerKind} entries`, kind)
}

const duplicateTarget = (proposal: RefinementProposal): RefinementRejected | undefined => {
  const targets = new Set<string>()
  for (const edit of proposal.edits) {
    const key = editKey(edit)
    if (targets.has(key)) return rejection(proposal.id, "duplicate-target", "proposal edits one target twice", key)
    targets.add(key)
  }
  return undefined
}

/**
 * @experimental Apply one proposal that may pin an exact revision, recording before and after entries for every edit.
 *
 * This is the trusted route: a pinned `revision` chooses an entry's `createdAt`, `updatedAt`, and `version` outright.
 * Only a host that already owns the audit trail may use it, which is why rollback and restore name it explicitly while
 * every ordinary refinement goes through `applyProposal`.
 */
export const applyTrustedProposal: {
  (
    proposal: RefinementProposal,
    options?: ApplyOptions,
  ): (state: HarnessState) => Result.Result<RefinementResult, RefinementRejected>
  (
    state: HarnessState,
    proposal: RefinementProposal,
    options?: ApplyOptions,
  ): Result.Result<RefinementResult, RefinementRejected>
} = Function.dual(
  (args) => "schemaVersion" in args[0],
  (
    state: HarnessState,
    proposal: RefinementProposal,
    options: ApplyOptions = {},
  ): Result.Result<RefinementResult, RefinementRejected> => {
    const before = snapshotId(state)
    if (proposal.rollbackOf !== undefined && state.refinements.at(-1)?.proposal !== proposal.rollbackOf) {
      return Result.fail(
        rejection(
          proposal.id,
          "rollback-not-newest",
          "only the newest refinement can be rolled back",
          proposal.rollbackOf,
        ),
      )
    }
    if (proposal.baseSnapshot !== undefined && proposal.baseSnapshot !== before) {
      return Result.fail(rejection(proposal.id, "baseline-drift", `state is ${before}, not ${proposal.baseSnapshot}`))
    }
    const duplicate = duplicateTarget(proposal)
    if (duplicate !== undefined) return Result.fail(duplicate)
    let next = state
    const applied: Array<AppliedRefinementEdit> = []
    for (const edit of proposal.edits) {
      const outcome = applyEdit(next, proposal.id, proposal.at, edit)
      if (Result.isFailure(outcome)) return Result.fail(outcome.failure)
      next = outcome.success.state
      applied.push(outcome.success.applied)
    }
    const capacity = overCapacity(next, proposal.id, options.maxEntriesPerKind)
    if (capacity !== undefined) return Result.fail(capacity)
    const event: RefinementEventInput = {
      proposal: proposal.id,
      at: proposal.at,
      scope: state.scope,
      before,
      after: snapshotId(next),
      applied,
    }
    if (proposal.rationale !== undefined) event.rationale = proposal.rationale
    if (proposal.source !== undefined) event.source = proposal.source
    const history = [...next.refinements, event]
    const bound = options.maxRefinements
    const refinements = bound === undefined ? history : history.slice(Math.max(0, history.length - Math.max(0, bound)))
    return Result.succeed({ state: { ...next, refinements }, event })
  },
)

/**
 * @experimental Apply one authored proposal atomically, recording before and after entries for every edit.
 *
 * The brand is a compile-time discriminator; the runtime authorization boundary is the pinned-revision check below.
 * A host that mounts this behind an `unknown` boundary gets that check even when a cast erased the brand. Revision
 * stays the engine's: a create lands at version 1 and an update bumps the entry it replaces.
 */
export const applyProposal: {
  (
    proposal: AuthoredRefinementProposal,
    options?: ApplyOptions,
  ): (state: HarnessState) => Result.Result<RefinementResult, RefinementRejected>
  (
    state: HarnessState,
    proposal: AuthoredRefinementProposal,
    options?: ApplyOptions,
  ): Result.Result<RefinementResult, RefinementRejected>
} = Function.dual(
  (args) => "schemaVersion" in args[0],
  (
    state: HarnessState,
    proposal: AuthoredRefinementProposal,
    options: ApplyOptions = {},
  ): Result.Result<RefinementResult, RefinementRejected> =>
    isAuthored(proposal)
      ? applyTrustedProposal(state, proposal, options)
      : Result.fail(rejection(proposal.id, "pinned-revision", "an authored proposal may not pin a revision")),
)

const inverse = (applied: AppliedRefinementEdit): RefinementEdit => {
  const { after, before, edit } = applied
  if (edit._tag === "Create") {
    const inverseEdit: InverseDeleteEdit = {
      _tag: "Delete",
      kind: edit.kind,
      id: edit.id,
    }
    if (after !== undefined) inverseEdit.baseVersion = after.version
    return inverseEdit
  }
  if (before === undefined) return edit
  if (edit._tag === "Delete") {
    return { _tag: "Create", kind: before.kind, id: before.id, value: value(before), revision: revision(before) }
  }
  const inverseEdit: InverseUpdateEdit = {
    _tag: "Update",
    kind: before.kind,
    id: before.id,
    value: value(before),
    revision: revision(before),
  }
  if (after !== undefined) inverseEdit.baseVersion = after.version
  return inverseEdit
}

/** @experimental Identity of the inverse proposal of one applied refinement. */
export interface RollbackOptions {
  readonly id: HarnessId
  readonly at: HarnessInstant
  readonly rationale?: string
  readonly source?: string
}

/** @experimental Build the proposal that restores the exact entries one refinement replaced. */
export const rollbackProposal: {
  (options: RollbackOptions): (result: RefinementResult) => RefinementProposal
  (result: RefinementResult, options: RollbackOptions): RefinementProposal
} = Function.dual(2, (result: RefinementResult, options: RollbackOptions): RefinementProposal => {
  const proposal: RollbackProposalInput = {
    id: options.id,
    at: options.at,
    baseSnapshot: snapshotId(result.state),
    rollbackOf: result.event.proposal,
    edits: result.event.applied.toReversed().map(inverse),
  }
  if (options.rationale !== undefined) proposal.rationale = options.rationale
  if (options.source !== undefined) proposal.source = options.source
  return proposal
})

/** @experimental The exact snapshot one rollback proposal restores. */
export const rollbackTarget = (result: RefinementResult): HarnessSnapshotId => result.event.before
