# Package catalog

> **Prerequisite:** `@in-time-tec/generalist-skills-example` is intentionally unpublished. Start a local npm registry and publish the in-repo reference package to it before running this example.

This example installs the package from the registry named by `GENERALIST_NPM_REGISTRY_URL`, locks the exact version and archive integrity under `.generalist/`, and runs an agent whose toolkit comes from the installed package. A scripted language model calls the package's `package_echo` tool so the run is deterministic.

From the repository root, start a disposable local registry:

```bash
bunx verdaccio@6.1.6 --config examples/package-catalog/verdaccio.yaml --listen 4873
```

In another terminal, package and publish the reference package, then run the example:

```bash
mkdir -p /tmp/generalist-package-catalog
npm pack ./examples/packages/generalist-skills-example --pack-destination /tmp/generalist-package-catalog
npm publish /tmp/generalist-package-catalog/in-time-tec-generalist-skills-example-1.0.0.tgz \
  --registry http://localhost:4873 --//localhost:4873/:_authToken=local
GENERALIST_NPM_REGISTRY_URL=http://localhost:4873 bun --cwd examples/package-catalog start
```

The package remains local to the disposable registry; these commands do not publish it to npmjs.com.
