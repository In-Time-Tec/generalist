# Generalist documentation

Consumer documentation follows the [Diátaxis](https://diataxis.fr) structure and lives in the docs site at [`apps/docs`](../apps/docs), published at:

- Production: https://generalist-docs-production.up.railway.app
- Staging: https://generalist-docs-staging.up.railway.app

| Quadrant      | Site section | Purpose                                                          |
| ------------- | ------------ | ---------------------------------------------------------------- |
| Tutorials     | Start        | Introduction, five-minute quickstart, and full app walkthroughs. |
| How-to guides | Guides       | Task-oriented recipes: tools, providers, memory, MCP, and more.  |
| Explanation   | Learn        | How and why the agent loop, sessions, and durable Runtime work.  |
| Reference     | Reference    | Every public entrypoint and its contract.                        |

Site pages are TypeScript modules under `apps/docs/src/pages` with typechecked snippets under `apps/docs/src/snippets`; the build also generates the LLM text files. Deployment is described in [`deployment.md`](deployment.md).

This `docs/` directory holds contributor-facing records:

- [`features/`](features/) — current behavior and invariants the code relies on.
- [`decisions/`](decisions/) — durable reasons behind important choices.
- [`tradeoffs/`](tradeoffs/) — meaningful gains and costs.

Vocabulary and ownership live in [`CONTEXT.md`](../CONTEXT.md), and product direction lives in [`PRODUCT.md`](../PRODUCT.md). Runnable examples live in [`examples/`](../examples), one README each.
