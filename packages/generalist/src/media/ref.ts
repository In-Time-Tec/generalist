import { Schema } from "effect"

export const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).annotate({
  description: "Lowercase hexadecimal SHA-256 digest",
})
const Bytes = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** Content-addressed reference persisted in prompts, journals, and API payloads. @experimental */
export const Ref = Schema.Struct({
  sha256: Sha256,
  mediaType: Schema.String,
  bytes: Bytes,
  filename: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "GeneralistMediaRef" })

/** Content-addressed reference persisted in prompts, journals, and API payloads. @experimental */
export type Ref = typeof Ref.Type

/** Schema for a typed Agent field containing media of one declared media type. @experimental */
export const File = <const MediaType extends string>(options: { readonly mediaType: MediaType }) =>
  Ref.pipe(
    Schema.check(
      Schema.makeFilter((ref) => ref.mediaType === options.mediaType || `Expected media type ${options.mediaType}`),
    ),
    Schema.annotate({
      identifier: `GeneralistMediaFile<${options.mediaType}>`,
      description: `Content-addressed ${options.mediaType} file reference`,
    }),
  )
