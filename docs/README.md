# Generalist documentation

Keep an agent's accepted work when its host restarts. Generalist pairs an optional object-backed Runtime with a process-local Effect agent loop, so you can start with a script and add recovery when the work needs it.

The documentation site is a code-first Foldkit + StyleX app built from this directory. Its pages are authored TypeScript, not a Markdown tree: [`src/content.ts`](src/content.ts) is the content model, and each section renders verified snippets imported from `examples/docs-snippets/`.

## Work on the site

From the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

`bun run dev` starts the Vite dev server. Edit `src/content.ts` to change sections; code blocks import `?raw` sources so documented code stays compilable.

Before submitting changes:

```sh
bun run docs:build
```

This runs the `docs/features` checks and the Vite client + SSR builds. Runnable examples live in `examples/docs-snippets`; `bun run readme:check` executes the website checkpoints and `bun run verify-scripted-surfaces` runs the offline examples and reports credential-dependent skips.

## Other documentation in this directory

- [`features/`](features/): current behavior and invariants, each with a leading runnable example and a test link.
- [`decisions/`](decisions/): durable reasons behind the design.
- [`tradeoffs/`](tradeoffs/): meaningful gains and costs.
- [`openapi.json`](openapi.json): the generated transport schema; `bun scripts/render-openapi.ts` refreshes it.

See [Deployment](deployment.md) for how the site ships.
