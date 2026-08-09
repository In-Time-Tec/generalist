import { Brand, Effect, Schema } from "effect"
import { AuthoredProposal, type AuthoredRefinementProposal } from "./entry.js"

export { isAuthored } from "./refinement.js"

/** @experimental Why untrusted proposal input was refused before it could reach the engine. */
export const AuthorshipRejection = Schema.Literals(["pinned-revision", "malformed"])
/** @experimental */
export type AuthorshipRejection = typeof AuthorshipRejection.Type

/** @experimental Untrusted proposal input was refused and no state was inspected or changed. */
export class AuthorshipRejected extends Schema.TaggedErrorClass<AuthorshipRejected>()(
  "@batonfx/harness/AuthorshipRejected",
  { reason: AuthorshipRejection, message: Schema.String },
) {}

const decodeAuthored = Schema.decodeUnknownEffect(AuthoredProposal, { onExcessProperty: "error" })

const authored = Brand.nominal<AuthoredRefinementProposal>()

const carriesRevision = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  "edits" in value &&
  Array.isArray(value.edits) &&
  value.edits.some((edit: unknown) => typeof edit === "object" && edit !== null && "revision" in edit)

/**
 * @experimental Accept one proposal from an untrusted author. A pinned `revision` is refused rather than trusted or
 * silently dropped, so model-originated input can never choose an entry's createdAt, updatedAt, or version.
 */
export const authorProposal = (input: unknown): Effect.Effect<AuthoredRefinementProposal, AuthorshipRejected> =>
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
      )
