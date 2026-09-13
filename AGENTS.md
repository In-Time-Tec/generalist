# Generalist

Generalist is an Effect-native agent framework. It provides a process-local agent loop and an optional durable Runtime backed by local-directory or S3-compatible object storage. Applications own model providers, compute hosts, sandboxes, interfaces, and deployment; keep extension contracts provider-neutral.

## Work in this repository

Use Bun 1.4.0 and the committed lockfile.

```bash
bun install --frozen-lockfile
bun run dev
bun run build
bun run format
```

Run focused checks while editing:

```bash
bun --bun vitest run packages/generalist/test/<path>.test.ts --no-file-parallelism
bun run --cwd packages/generalist typecheck
bun node_modules/prettier/bin/prettier.cjs --check <paths>
```

Before review or release, run:

```bash
bun run check
bun run test
bun run package
(cd release && sha256sum --check SHA256SUMS)
```

Package tests live under `packages/generalist/test/`. Durability changes must include a fresh-Layer or close/reopen recovery case. Local directory and MinIO tests do not certify a deployed S3 provider.

## Engineering rules

- Follow existing Effect patterns and keep Effects lazy until application, framework, or test boundaries.
- Use Effect AI `Prompt`, `Response`, `Tool`, and `Toolkit` directly.
- Use Effect platform services for boundaries they own and `Schema` for serialized or untrusted data.
- Preserve typed failures, interruption, scopes, resource ownership, and bounded concurrency.
- Keep public seams focused and provider-neutral. Do not add vendor model, compute, sandbox, or native storage adapters.
- Filesystem and S3-compatible durability are the maintained production transports.
- Keep one current pre-1.0 contract; update callers and remove replaced paths instead of adding compatibility shims.
- Never edit, import, format, build, or test `repos/effect`; it is read-only reference material.
- Do not add root `scripts/`, `examples/`, or `test/` trees. Use package-local tests and direct package commands.

`PRODUCT.md` owns product scope. `CONTEXT.md` owns architecture and vocabulary. `docs/features/` describes current behavior; `docs/decisions/` and `docs/tradeoffs/` preserve design reasoning.

## Releases

The public package is `generalist`. Keep root and package versions equal, update `CHANGELOG.md`, verify an exact clean commit, land it on `main`, and require successful CI before creating its immutable `v<version>` tag. Tag pushes run `.github/workflows/publish.yml`; do not publish from a workstation.
