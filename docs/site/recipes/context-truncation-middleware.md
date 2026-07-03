# Context-Truncation Middleware

Use `ModelMiddleware.transformPrompt` for cheap input trimming when a host wants a local policy before the model sees the prompt. Use the `Compaction` service when truncation must understand session cut points and summaries.

Recommended shape: redact or truncate nonessential user text with middleware, then let `Compaction.layer` handle long-running session history.
