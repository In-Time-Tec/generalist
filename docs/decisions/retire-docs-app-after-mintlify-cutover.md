# Mintlify is the documentation site

The cutover is approved: `docs/` is the documentation source and Mintlify is the only documentation renderer and
deployment target. The former `apps/docs` Foldkit site was removed instead of retaining a second navigation, search,
rendering, and deployment system.

The authored TypeScript pages were rendered to Markdown during migration. Their runnable sources live under
`examples/docs-snippets` and remain part of the scripted-surface check. The Foldkit adapter and the independently useful
deep-research web example remain supported; neither requires retaining a parallel docs shell. A future interactive demo
must be an independently useful example rather than another documentation application.
