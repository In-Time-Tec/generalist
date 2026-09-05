# Package distribution

Generalist ships as one compiled ESM package. Adapters such as `generalist/pg`, `generalist/mysql`, and
`generalist/unstable/rivet` are subpath exports of `generalist`, not separate packages. Their dependencies are optional
peers, so consumers install only the integrations they use.

```sh
bun add generalist effect
bun add @effect/sql-pg # only when using generalist/pg
```

Export targets point to JavaScript and declarations under `dist/`. The package includes only `dist`, `LICENSE`, and
`README.md`, is ESM-only, and supports Node 22 or newer and Bun 1.4.0 or newer.

## Release

The root and package manifest versions must match. The release workflow builds once, uses `bun pm pack` to create one
versioned tarball, records its SHA-256 checksum, attaches those two files to the GitHub release, and publishes that exact
tarball to npm. It then compares npm's integrity value with the local tarball.

A `v<version>` tag must point to the release commit on `main`. Manual workflow dispatch only reconciles an existing tag
and requires its full commit SHA.

## Related

- Source: `packages/generalist/package.json`, `.github/workflows/publish.yml`
- Site: `/docs/start/installation`
- Decision: `../decisions/compiled-packages.md`
