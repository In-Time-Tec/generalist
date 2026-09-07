import { Schema, SchemaTransformation } from "effect"
import { Response } from "effect/unstable/ai"
import { EntryPayload, type AppendInput, type CompactionEntry, type Entry } from "../../../core/context/session.js"

type HydratedPayload = AppendInput | Omit<CompactionEntry, "id" | "parentId">
type AppendPayload = Exclude<EntryPayload, { readonly _tag: "Compaction" }>

function hydratePayload(payload: AppendPayload): AppendInput
function hydratePayload(payload: EntryPayload): HydratedPayload
function hydratePayload(payload: EntryPayload): HydratedPayload {
  if (payload._tag !== "ModelResponse") return payload
  return {
    ...payload,
    content: payload.content.map((part) => {
      switch (part.type) {
        case "tool-call":
          return Response.makePart("tool-call", part)
        case "tool-result":
          return Response.makePart("tool-result", part)
        case "finish":
          return Response.makePart("finish", {
            ...part,
            response: part.response,
            // EntryPayload already validates finite counters, not only integers.
            // Preserve that domain contract while restoring Effect's Usage class.
            usage: Response.Usage.make(
              {
                inputTokens: {
                  uncached: part.usage.inputTokens.uncached,
                  total: part.usage.inputTokens.total,
                  cacheRead: part.usage.inputTokens.cacheRead,
                  cacheWrite: part.usage.inputTokens.cacheWrite,
                },
                outputTokens: {
                  total: part.usage.outputTokens.total,
                  text: part.usage.outputTokens.text,
                  reasoning: part.usage.outputTokens.reasoning,
                },
              },
              { disableChecks: true },
            ),
          })
        default:
          return part
      }
    }),
  }
}

const Identity = Schema.Struct({ id: Schema.String, parentId: Schema.NullOr(Schema.String) })
const payloadType = Schema.toType(EntryPayload)
const isPayload = Schema.is(
  Schema.declare<HydratedPayload>(
    (input): input is HydratedPayload =>
      Schema.is(payloadType)(input) && (input._tag !== "ModelResponse" || input.content.every(Response.isPart)),
  ),
)

/** Shared session wire form retains the domain-owned payload and exact ancestry. */
const StoredEntry = Schema.Struct({ ...Identity.fields, payload: EntryPayload })
export const SessionEntryCodec: Schema.Codec<Entry, unknown> = StoredEntry.pipe(
  Schema.decodeTo(
    Schema.declare<Entry>((input): input is Entry => Schema.is(Identity)(input) && isPayload(input)),
    SchemaTransformation.transform<Entry, typeof StoredEntry.Type>({
      decode: ({ id, parentId, payload }) => ({ id, parentId, ...hydratePayload(payload) }),
      encode: (entry) => {
        const { id, parentId, ...payload } = entry
        return { id, parentId, payload }
      },
    }),
  ),
)

const AppendPayload = EntryPayload.pipe(
  Schema.refine((payload): payload is AppendPayload => payload._tag !== "Compaction"),
)
export const SessionAppendInputCodec: Schema.Codec<AppendInput, unknown> = AppendPayload.pipe(
  Schema.decodeTo(
    Schema.declare<AppendInput>((input): input is AppendInput => isPayload(input) && input._tag !== "Compaction"),
    SchemaTransformation.transform<AppendInput, AppendPayload>({ decode: hydratePayload, encode: (input) => input }),
  ),
)
