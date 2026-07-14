# ADR-0026 — Working-memory Summary Model Composition

## Status

Accepted.

## Context

Working memory accepted a language-model `Layer` in its summarization options and built that layer inside every overflow operation. Repeated builds gave each overflow a separate acquisition scope, prevented reuse of a stateful model service, and obscured the resource lifetime that should belong to the working-memory instance.

## Decision

Introduce `WorkingMemory.SummaryModel` as a dedicated service whose value is an Effect AI `LanguageModel.Service`. `WorkingMemory.make` requires that service when summarization is configured, and `WorkingMemory.layer` carries the same requirement. Construction captures the service once and every overflow reuses it. `summaryModelLayer` adapts the ambient Effect AI `LanguageModel` service into the dedicated role so applications select and scope the summarization model through ordinary layer composition.

Serialize remember operations within each working-memory instance. Summarization and the following state update therefore form one bounded critical section, preventing concurrent overflows from losing summaries or recent messages.

Keep the existing layer-valued `summarize.model` option as a deprecated migration path. The compatibility path builds that layer once during working-memory construction in the owning scope. It does not rebuild the layer during overflow.

## Consequences

- New composition makes the summary model requirement and its acquisition failure visible at the layer boundary.
- Model-call failures continue to map to `MemoryError`.
- Scoped summary-model resources are acquired once and released once with the layer that owns working memory, including after model-call failure or interruption.
- The agent loop's ambient model remains unrelated to working-memory summarization.
- Existing `WorkingMemory.layer({ summarize: { model } })` consumers remain source-compatible while migrating to `SummaryModel` composition.
- No provider default, prompt, summary policy, durability, or unbounded concurrency is introduced.
