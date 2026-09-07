import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { CompactionEntry } from "../../../core/context/session.js"
import { CompactionCommit, Event as ModelTelemetryEvent } from "../../../core/model/telemetry/events.js"
import { ExecutionClaim } from "./schema.js"
import { SessionAppendInputCodec, SessionEntryCodec } from "./session.js"

const CommandId = Schema.String.check(Schema.isNonEmpty())
export const AppendOptions = Schema.Union([
  Schema.Struct({ commandId: CommandId, expectedLeafId: Schema.optionalKey(Schema.NullOr(Schema.String)) }),
  Schema.Struct({ id: Schema.String, expectedLeafId: Schema.NullOr(Schema.String) }),
])
const PreparedCheckpoint = Schema.Struct({
  id: Schema.String,
  parentId: Schema.NullOr(Schema.String),
  projectedHistory: Prompt.Prompt,
  telemetry: Schema.Array(ModelTelemetryEvent),
  compactionCommit: Schema.optionalKey(CompactionCommit),
  summary: Schema.optionalKey(Schema.String),
})
const CheckpointAppend = Schema.Struct({
  _tag: Schema.Literals(["Appended", "AlreadyPresent"]),
  checkpoint: SessionEntryCodec.pipe(Schema.refine((entry): entry is CompactionEntry => entry._tag === "Compaction")),
  leafId: Schema.String,
})
const reserveInput = Schema.Tuple([ExecutionClaim, CommandId])
const appendInput = Schema.Tuple([ExecutionClaim, SessionAppendInputCodec, AppendOptions])
const checkpointInput = Schema.Tuple([ExecutionClaim, PreparedCheckpoint])
const leafInput = Schema.Tuple([ExecutionClaim, Schema.NullOr(Schema.String), CommandId])

export const commands = {
  reserveEntryId: {
    tag: "session.reserveEntryId",
    input: reserveInput,
    receipt: Schema.String,
    identity: ([claim, commandId]: typeof reserveInput.Type) =>
      JSON.stringify([claim.session.sessionId, claim.session.epoch, commandId]),
  },
  append: {
    tag: "session.append",
    input: appendInput,
    receipt: SessionEntryCodec,
    identity: (input: typeof appendInput.Type) => {
      const claim = input[0]
      const options = input[2]
      return JSON.stringify([
        claim.session.sessionId,
        claim.session.epoch,
        "id" in options ? ["entry", options.id] : ["command", options.commandId],
      ])
    },
  },
  appendCheckpoint: {
    tag: "session.appendCheckpoint",
    input: checkpointInput,
    receipt: CheckpointAppend,
    identity: ([claim, checkpoint]: typeof checkpointInput.Type) =>
      JSON.stringify([claim.session.sessionId, claim.session.epoch, checkpoint.id]),
  },
  setLeaf: {
    tag: "session.setLeaf",
    input: leafInput,
    receipt: Schema.Void,
    identity: (input: typeof leafInput.Type) =>
      JSON.stringify([input[0].session.sessionId, input[0].session.epoch, input[2]]),
  },
} as const
