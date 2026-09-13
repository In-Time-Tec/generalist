# Mintlify is the documentation site

**Superseded by [the code-first documentation site](code-first-docs-site.md).** Mintlify was later removed and the
Foldkit + StyleX app in `docs/` became the documentation renderer and deployment target this decision retired.

The cutover is approved: `docs/` is the documentation source and Mintlify is the only documentation renderer and
deployment target. The former `apps/docs` Foldkit site was removed instead of retaining a second navigation, search,
rendering, and deployment system.

The authored TypeScript pages were rendered to Markdown during migration. Their runnable sources live under
`docs/src/snippets` and remain part of the documentation source. A future interactive demo must be an independently
useful product surface rather than another documentation application.
