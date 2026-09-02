# Package catalog

This example shows how to resolve the workspace reference package through an npm-compatible local registry. The repository tests serve `@in-time-tec/generalist-skills-example` from an in-memory local registry fixture and exercise the same catalog configuration.

```sh
bun run typecheck
```

The catalog installs package instructions and skills, opts into its tools, and uses the package toolkit with a typed agent.
