# Batonfx documentation

The consumer documentation lives in the docs site application at [`apps/docs`](../../apps/docs) and is published at:

- Production: https://batonfx-docs.up.railway.app
- Staging: https://batonfx-docs-staging.up.railway.app

Pages are TypeScript modules under [`apps/docs/src/pages`](../../apps/docs/src/pages) with typechecked snippets under [`apps/docs/src/snippets`](../../apps/docs/src/snippets); runnable snippets are executed and diffed against captured output by `bun run check:snippets` in CI.

Normative contracts stay in [`docs/spec`](../spec), indexed by [`SPEC.md`](../../SPEC.md). Canonical vocabulary lives in [`CONTEXT.md`](../../CONTEXT.md). Runnable examples live in [`examples`](../../examples), one README each.
