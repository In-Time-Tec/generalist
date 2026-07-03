# Middleware, Guardrails, and Resilience

`ModelMiddleware` transforms prompts before model calls and streamed parts before the loop folds them. Guardrails are middleware combinators, not a separate subsystem.

`Guardrail.validateInput`, `redactInput`, `redactOutput`, and `filterOutput` cover common local policies. `ModelResilience` classifies provider failures and retries model calls only when it is safe: streaming retries stop after any part has been emitted.

Recipe: [`../recipes/pii-scrub-guardrail.md`](../recipes/pii-scrub-guardrail.md).
