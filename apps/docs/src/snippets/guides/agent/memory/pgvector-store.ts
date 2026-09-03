import { Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { layerPgVector, VectorStore } from "generalist/memory"

// Provide this layer with the application's existing effect/unstable/sql SqlClient.
export const pgvectorLayer: Layer.Layer<VectorStore.VectorStore, VectorStore.VectorStoreError, SqlClient.SqlClient> =
  layerPgVector({ table: "memory_documents", dimensions: 1_536 })
