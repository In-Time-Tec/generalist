# pgvector VectorStore

`@batonfx/memory` defines a provider-neutral `VectorStore` interface. A pgvector adapter should implement `upsert` by storing `(agent, subject, id, text, metadata, embedding)` and `query` by filtering on `(agent, subject)` before cosine or inner-product ranking.

Keep the adapter host-owned until Baton specifies a database package. The in-process `VectorStore.memoryLayer` remains the offline-safe default.
