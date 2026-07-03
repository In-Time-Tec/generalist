# 0.1.0 Release Train

The coordinated release publishes every package at the same version in dependency order: core, skills, memory, providers, mcp, transport, then foldkit.

The publish workflow is manual. It accepts an explicit version, defaults to `0.1.0`, rewrites `workspace:*` and `catalog:` protocols out of package manifests, runs `bun publish --access public --dry-run` for every package, and only publishes/tags when `dry_run=false`.

After publish, smoke-check a scratch Bun consumer by installing each package at `0.1.0`, importing its documented exports, and running `bun tsc --noEmit`.
