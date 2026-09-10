# The code-first site is the documentation

Supersedes [Mintlify is the documentation site](retire-docs-app-after-mintlify-cutover.md).

The Foldkit + StyleX app in `docs/` is the documentation renderer and deployment target. Its pages are authored
TypeScript in `docs/src/content.ts`; code blocks import `?raw` sources from `examples/docs-snippets/` so documented
code stays compilable and `test/docs/` plus the website checkpoints verify it.

Mintlify and the TypeDoc-to-Markdown API pipeline were removed with the page tree they rendered (`docs/start`,
`docs/guides`, `docs/learn`, `docs/reference`, `docs/api`, `docs.json`). The Markdown authorities that record
behavior and reasons remain: `docs/features/`, `docs/decisions/`, `docs/tradeoffs/`, and the generated
`docs/openapi.json`. The Mintlify page tree's durable-concept chapters were condensed into the site's architecture
section rather than kept as a parallel corpus.
