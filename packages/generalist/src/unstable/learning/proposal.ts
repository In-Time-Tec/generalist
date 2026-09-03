import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { OperationRef, Version } from "../../core/context/memory.js"
import { RunId } from "../../core/durable/run-id.js"
import { GuidanceId } from "../../instructions/entry.js"

/** @experimental One exact run turn supporting a proposed change. */
export const TrajectoryRef = OperationRef

/** @experimental */
export type TrajectoryRef = typeof TrajectoryRef.Type

const MemoryKey = Schema.Struct({ agent: Schema.String, subject: Schema.String })

/** @experimental Memory input that an application handler may adapt to its Memory service. */
export const MemoryEntry = Schema.Struct({
  key: MemoryKey,
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  transcript: Prompt.Prompt,
  terminal: Schema.Boolean,
  entryId: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  supersedes: Schema.optionalKey(Version),
})

/** @experimental */
export type MemoryEntry = typeof MemoryEntry.Type

/** @experimental Memory entry selected for removal from active recall. */
export const ForgetEntry = Schema.Struct({
  key: MemoryKey,
  id: Schema.String.check(Schema.isNonEmpty()),
})

/** @experimental */
export type ForgetEntry = typeof ForgetEntry.Type

/** @experimental A proposed instruction change plus the trajectory turns supporting it. */
export const RefineInstruction = Schema.TaggedStruct("RefineInstruction", {
  target: GuidanceId,
  diff: Schema.String,
  evidence: Schema.Array(TrajectoryRef),
})

/** @experimental */
export type RefineInstruction = typeof RefineInstruction.Type

/** @experimental A proposed skill plus the trajectory turns supporting it. */
export const AuthorSkill = Schema.TaggedStruct("AuthorSkill", {
  name: Schema.String,
  content: Schema.String,
  evidence: Schema.Array(TrajectoryRef),
})

/** @experimental */
export type AuthorSkill = typeof AuthorSkill.Type

/** @experimental A proposed memory entry plus the trajectory turns supporting it. */
export const Remember = Schema.TaggedStruct("Remember", {
  memory: MemoryEntry,
  evidence: Schema.Array(TrajectoryRef),
})

/** @experimental */
export type Remember = typeof Remember.Type

/** @experimental A proposed removal from active semantic recall. */
export const Forget = Schema.TaggedStruct("Forget", {
  memory: ForgetEntry,
  evidence: Schema.Array(TrajectoryRef),
})

/** @experimental */
export type Forget = typeof Forget.Type

/** @experimental A proposed JSON Lines export of one recorded run. */
export const ExportTrajectory = Schema.TaggedStruct("ExportTrajectory", {
  runId: RunId,
  format: Schema.Literal("jsonl"),
})

/** @experimental */
export type ExportTrajectory = typeof ExportTrajectory.Type

/** @experimental One reviewable change proposed after a run. */
export const Proposal = Schema.Union([RefineInstruction, AuthorSkill, Remember, Forget, ExportTrajectory])

/** @experimental */
export type Proposal = typeof Proposal.Type

export const Proposals = Schema.Array(Proposal)

/** @experimental Plain Effect handlers selected only by proposal tag. */
export interface ApplyHandlers<R = never, E = never> {
  readonly RefineInstruction: (proposal: RefineInstruction) => Effect.Effect<void, E, R>
  readonly AuthorSkill: (proposal: AuthorSkill) => Effect.Effect<void, E, R>
  readonly Remember: (proposal: Remember) => Effect.Effect<void, E, R>
  readonly Forget: (proposal: Forget) => Effect.Effect<void, E, R>
  readonly ExportTrajectory: (proposal: ExportTrajectory) => Effect.Effect<void, E, R>
}

/** @experimental Handlers for the proposal kinds emitted by scheduled consolidation. */
export interface ConsolidationApplyHandlers<R = never, E = never> {
  readonly RefineInstruction: (proposal: RefineInstruction) => Effect.Effect<void, E, R>
  readonly Remember: (proposal: Remember) => Effect.Effect<void, E, R>
  readonly Forget: (proposal: Forget) => Effect.Effect<void, E, R>
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Internal proposal dispatch, not a public combinator.
export const handlerFor = <R, E>(handlers: ApplyHandlers<R, E>, proposal: Proposal): Effect.Effect<void, E, R> => {
  switch (proposal._tag) {
    case "RefineInstruction":
      return handlers.RefineInstruction(proposal)
    case "AuthorSkill":
      return handlers.AuthorSkill(proposal)
    case "Remember":
      return handlers.Remember(proposal)
    case "Forget":
      return handlers.Forget(proposal)
    case "ExportTrajectory":
      return handlers.ExportTrajectory(proposal)
  }
}
