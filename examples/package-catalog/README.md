# Package catalog

This example installs `@in-time-tec/generalist-skills-example` from npm, locks the exact version and archive integrity under `.generalist/`, and runs an agent whose toolkit comes from the installed package. A scripted language model calls the package's `package_echo` tool so the run is deterministic.

```bash
bun --cwd examples/package-catalog start
```

The reference package source lives at `examples/packages/generalist-skills-example`. Until it is published, point `npmRegistryUrl` at a local registry that serves it.
