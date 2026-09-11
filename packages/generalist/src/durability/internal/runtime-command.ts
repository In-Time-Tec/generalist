import { Schema } from "effect"

/** Internal facade contract; raw changes and caller-supplied authority are never public commands. */
export interface Definition<Input, Receipt> {
  readonly tag: string
  readonly input: Schema.Codec<Input, unknown>
  readonly identity: (input: Input) => string
  /**
   * Stable projection of the typed input hashed as the journal input digest.
   * Supply it only when the input carries derived facts (clock instants, host
   * state) that must not make an exact retry look like different input; the
   * transition still receives the full input, and only the projection is
   * recorded as the command input digest. A different projection fails
   * `input-conflict` before the transition, exactly like different input today.
   */
  readonly digestInput?: (input: Input) => Input
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
