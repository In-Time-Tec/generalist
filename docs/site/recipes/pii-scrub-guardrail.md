# PII-Scrub Guardrail

Use `Guardrail.redactInput` and `Guardrail.redactOutput` through `ModelMiddleware.layer([...])` to replace sensitive text before prompts reach the provider and before streamed deltas reach consumers.

For stronger policies, combine `Guardrail.validateInput` with host-specific detectors. Baton keeps detectors outside core so applications can choose their own compliance dependencies.
