import { Schema } from "effect"

/** Internal facade contract; raw changes and caller-supplied authority are never public commands. */
export interface Definition<Input, Receipt> {
  readonly tag: string
  readonly input: Schema.Codec<Input, unknown>
  readonly identity: (input: Input) => string
  readonly receipt: Schema.Codec<Receipt, unknown>
}

export const OwnershipInput = Schema.Tuple([
  Schema.Struct({
    incarnation: Schema.String,
    commandId: Schema.String.check(Schema.isNonEmpty()),
    owners: Schema.Array(Schema.String),
    leaseMillis: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1000)),
  }),
])

export const ownershipCommands = {
  acquire: {
    tag: "ownership.acquire",
    input: OwnershipInput,
    receipt: Schema.Void,
    identity: ([input]: typeof OwnershipInput.Type) => input.commandId,
  },
  reconcile: {
    tag: "ownership.reconcile",
    input: OwnershipInput,
    receipt: Schema.Void,
    identity: ([input]: typeof OwnershipInput.Type) => input.commandId,
  },
  release: {
    tag: "ownership.release",
    input: OwnershipInput,
    receipt: Schema.Void,
    identity: ([input]: typeof OwnershipInput.Type) => input.commandId,
  },
} as const
