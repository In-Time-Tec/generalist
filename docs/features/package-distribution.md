# Package distribution

Generalist ships as one `generalist` package. Compiled ESM and declarations are selected through explicit subpath exports; optional integrations declare their dependencies as peers.

## Usage

```sh
bun add generalist effect

# Add only the peer dependencies required by the subpaths you import.
bun add @aws-sdk/client-s3 @smithy/fetch-http-handler
```

```ts
import { Agent } from "generalist"
import { Runtime } from "generalist/runtime"
import * as S3 from "generalist/durability/s3"
```

These are import fragments, not a running Runtime. Package exports resolve to compiled `.js` and `.d.ts` files under `dist/`.

## Contributor verification

```sh
bun run check
bun run test
bun run package
(cd release && sha256sum --check SHA256SUMS)
```

`bun run package` builds the workspace and creates exactly two files:

```text
release/
├── generalist.tgz
└── SHA256SUMS
```

The package contains only `dist`, `LICENSE`, and `README.md`. It is pure ESM, declares `sideEffects: false`, supports Node 22+ and Bun 1.4+, and keeps Effect plus optional integrations external.

## Release flow

The exact release commit must use one lockstep semantic version in the root and package manifests, be on `main`, and pass main CI. Tagging that commit as `v<version>` starts `.github/workflows/publish.yml`. The workflow builds and checksums the tarball once, uploads those same assets to GitHub, publishes the unchanged tarball to npm, and verifies registry integrity.

Manual workflow dispatch only reconciles an existing immutable tag and its exact commit. Never publish from a workstation.

Local directory and MinIO qualification does not certify AWS S3 or another deployed S3-compatible provider.
