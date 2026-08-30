import { Brand, Effect, Function, Schema } from "effect"
import { AuthoredProposal, type AuthoredRefinementProposal } from "./entry.js"

export { isAuthored } from "./refinement.js"

/** @experimental Why untrusted proposal input was refused before it could reach the engine. */
export const AuthorshipRejection = Schema.Literals(["pinned-revision", "malformed"])
/** @experimental */
export type AuthorshipRejection = typeof AuthorshipRejection.Type

/** @experimental Untrusted proposal input was refused and no state was inspected or changed. */
export class AuthorshipRejected extends Schema.TaggedError<AuthorshipRejected>()(
  "tenetkit/agent-guidance/AuthorshipRejected",
  { reason: AuthorshipRejection, message: Schema.String },
) {}

const decodeAuthored = Schema.decodeUnknownEffect(AuthoredProposal, { onExcessProperty: "error" })

const authored = Brand.nominal<AuthoredRefinementProposal>()

const ProposalEdits = Schema.Struct({ edits: Schema.Array(Schema.Unknown) })
const RevisionCarrier = Schema.Struct({ revision: Schema.optionalKey(Schema.Unknown) })
const decodeProposalInput = Function.flow(
  Schema.decodeUnknownEffect(Schema.Unknown),
  Effect.mapError((error) => AuthorshipRejected.make({ reason: "malformed", message: String(error) })),
)

const carriesRevision = (value: typeof Schema.Unknown.Type): boolean =>
  Schema.is(ProposalEdits)(value) && value.edits.some((edit) => Schema.is(RevisionCarrier)(edit) && "revision" in edit)

/**
 * @experimental Accept one proposal from an untrusted author. A pinned `revision` is refused rather than trusted or
 * silently dropped, so model-originated input can never choose an entry's createdAt, updatedAt, or version.
 */
export const authorProposal = Function.flow(
  decodeProposalInput,
  Effect.flatMap((input) =>
    carriesRevision(input)
      ? Effect.fail(
          AuthorshipRejected.make({
            reason: "pinned-revision",
            message: "an authored edit may not pin a revision",
          }),
        )
      : decodeAuthored(input).pipe(
          Effect.map(authored),
          Effect.mapError((error) => AuthorshipRejected.make({ reason: "malformed", message: String(error) })),
        ),
  ),
)
