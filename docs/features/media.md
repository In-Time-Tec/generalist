# Media and blob storage

Generalist carries images, audio, video, and PDFs as content-addressed references. Blob bytes live in a `BlobStore`; typed Agent inputs, Session projections, durable model responses, Host calls, and HTTP responses carry `Media.Ref` values instead of embedding bytes in the journal.

## Typed Agent fields

```ts
import { Effect, Schema } from "effect"
import { Agent, Media } from "generalist"

const reviewer = Agent.make({
  name: "reviewer",
  input: Schema.Struct({
    pdf: Media.File({ mediaType: "application/pdf" }),
    question: Schema.String,
  }),
  output: Schema.String,
})

const review = Effect.gen(function* () {
  const pdf = yield* Media.fromPath("spec.pdf")
  return yield* Agent.run(reviewer, { pdf, question: "What changed?" })
})
```

`Media.Ref` is `{ sha256, mediaType, bytes, filename? }`. `Media.File({ mediaType })` keeps that TypeScript shape and checks the declared MIME type when the Agent input or output Schema runs. `Media.fromPath(path, { mediaType?, filename? })` reads through Effect `FileSystem`, infers common image, audio, video, and PDF extensions when `mediaType` is omitted, stores the bytes, and returns the reference.

Generated `Response.FilePart` bytes are stored before the model response is committed. The continuation contains the reference, allowing the structured-output call to return it in a field declared with `Media.File`. `Agent.run` and `Agent.stream` keep their existing return types: a typed output field is how an Agent returns a generated file.

## BlobStore

```ts
import { BlobStore } from "generalist"

const memory = BlobStore.layerMemory()
const files = BlobStore.layerFileSystem({ dir: ".generalist/blobs" })
const sql = BlobStore.layerSql()
const s3 = BlobStore.layerS3({ bucket: "attachments", client })
```

All adapters expose:

```text
put({ data, mediaType, filename? }) -> Media.Ref
get(sha256)                        -> { ref, data }
resolve(ref, { prefer })           -> { ref, data: Uint8Array | URL }
```

The default upload limit is 100 MiB; pass `maxBytes` to any Layer constructor to change it. Content is keyed by lowercase SHA-256. Repeated bytes retain the first stored media type and filename. The filesystem adapter writes one blob and one Schema-encoded metadata sidecar. `layerSql` creates `generalist_blobs` through the runtime `SqlClient` seam and stores portable base64 text. It does not change the Runtime schema version.

`layerS3` has no AWS SDK dependency. Its injected client implements `head(bucket, key)`, `put(bucket, key, object)`, and `get(bucket, key)`. Keys are `sha256/<digest>`. A returned object may include a signed `url`; `resolve` uses it when the active model's `ModelCatalog` metadata prefers URLs and otherwise returns bytes.

## Provider support

Generalist resolves a ref to an Effect AI `Prompt.FilePart` immediately before provider dispatch. `ModelCatalog.Metadata.media` records `input`, optional `output`, and `preferredInput`. Missing model metadata conservatively selects bytes. Actual model support can be narrower than its adapter, so applications should register metadata for the exact model they use.

| Released adapter         | Image input | PDF input         | Audio input                           | Video input       | Generated file output | Transport                                      |
| ------------------------ | ----------- | ----------------- | ------------------------------------- | ----------------- | --------------------- | ---------------------------------------------- |
| OpenAI Responses         | Yes         | Yes               | No                                    | No                | No                    | Bytes or URL; bundled catalog prefers bytes    |
| OpenAI Chat / compatible | Yes         | Yes               | No                                    | No                | No                    | Bytes or URL                                   |
| Anthropic                | Yes         | Yes               | No                                    | No                | No                    | Bytes or URL; bundled catalog prefers bytes    |
| OpenRouter               | Yes         | Pass-through file | Yes, supported formats and bytes only | Pass-through file | Images                | Image/PDF/video bytes or URL; audio bytes only |
| Amazon Bedrock Converse  | Yes         | Yes               | No                                    | No                | No                    | Bytes only                                     |

OpenAI, Anthropic, and Bedrock document acceptance above is the adapter contract. OpenRouter's generic PDF/video file path is forwarded to the selected upstream model, which remains authoritative for acceptance. The bundled catalog currently records image input for `gpt-4o-mini`, image/PDF input for `gpt-4.1`, `gpt-4.1-mini`, and `claude-3-5-haiku-latest`, and no generated file output claims.

## Journal and compaction

Agent input encoding adds reference-only file markers beside the Schema-encoded JSON. Model response files are replaced with an empty file payload plus Schema-validated reference metadata before durable encoding; their bytes never enter the journal. The final provider boundary resolves those markers from `BlobStore`.

Compaction defaults to `media: "elide"`: a file marker becomes one line containing the complete ref. `"keep"` retains the marker, while `"describe"` retains it and adds a one-line request to describe the media. No compaction mode copies blob bytes into Session state.

## Invariants

- SHA-256 identifies bytes; the first stored metadata for those bytes is canonical.
- Serialized and durable boundaries validate refs and metadata with Schema.
- Blob bytes are resolved only at file ingress, attachment download, and provider dispatch.
- A provider URL is used only when both the BlobStore can return one and the active model metadata prefers it.
- Missing content, oversized uploads, backend failures, path failures, and unsupported inferred types remain typed failures.

## Related

- Source: `packages/generalist/src/media/`, `packages/generalist/src/blob-store/`
- Sibling features: [`host.md`](./host.md), [`server.md`](./server.md), [`compaction.md`](./compaction.md), [`testing.md`](./testing.md)
