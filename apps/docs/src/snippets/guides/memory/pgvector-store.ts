import { Context, Effect, Layer } from "effect"
import { VectorStore } from "@batonfx/memory"

interface PgClientInterface {
  readonly run: (
    sql: string,
    params: ReadonlyArray<unknown>,
  ) => Effect.Effect<ReadonlyArray<Record<string, unknown>>, Error>
}

class PgClient extends Context.Service<PgClient, PgClientInterface>()("app/PgClient") {}

const storeError = (error: Error) => new VectorStore.VectorStoreError({ message: error.message })

export const pgvectorLayer: Layer.Layer<VectorStore.VectorStore, never, PgClient> = Layer.effect(
  VectorStore.VectorStore,
  Effect.gen(function* () {
    const client = yield* PgClient
    return VectorStore.VectorStore.of({
      upsert: (documents) =>
        Effect.forEach(
          documents,
          (document) =>
            client.run(
              `insert into memory_documents (agent, subject, id, text, metadata, embedding)
               values ($1, $2, $3, $4, $5, $6)
               on conflict (agent, subject, id) do update
               set text = $4, metadata = $5, embedding = $6`,
              [
                document.key.agent,
                document.key.subject,
                document.id,
                document.text,
                JSON.stringify(document.metadata ?? {}),
                JSON.stringify(document.embedding),
              ],
            ),
          { discard: true },
        ).pipe(Effect.mapError(storeError)),
      query: (input) =>
        client
          .run(
            `select id, text, metadata, embedding, 1 - (embedding <=> $3) as score
             from memory_documents
             where agent = $1 and subject = $2
             order by embedding <=> $3
             limit $4`,
            [input.key.agent, input.key.subject, JSON.stringify(input.embedding), input.limit],
          )
          .pipe(
            Effect.mapError(storeError),
            Effect.map((rows) =>
              rows.flatMap((row) => {
                const score = Number(row["score"])
                if (input.minScore !== undefined && score < input.minScore) return []
                return [
                  {
                    score,
                    document: {
                      id: String(row["id"]),
                      key: input.key,
                      text: String(row["text"]),
                      metadata: { source: "pgvector" },
                      embedding: input.embedding,
                    },
                  },
                ]
              }),
            ),
          ),
    })
  }),
)
