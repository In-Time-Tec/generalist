# Generalist documentation

The consumer documentation lives in the docs site application at [`apps/docs`](../../apps/docs) and is published at:

- Production: https://generalist-docs-production.up.railway.app
- Staging: https://generalist-docs-staging.up.railway.app

Pages are TypeScript modules under [`apps/docs/src/pages`](../../apps/docs/src/pages) with typechecked snippets under [`apps/docs/src/snippets`](../../apps/docs/src/snippets). The normal docs build generates the LLM text files and builds the site.

Current internal behavior is recorded in [`docs/features`](../features), with small supporting notes in [`docs/decisions`](../decisions) and [`docs/tradeoffs`](../tradeoffs). Vocabulary and ownership live in [`CONTEXT.md`](../../CONTEXT.md). Runnable examples live in [`examples`](../../examples), one README each.
