# Package distribution

Public packages ship compiled ESM, declarations under `dist/`, and the repository's MIT `LICENSE`. Export maps point only to built files and list types before imports. TenetKit and third-party dependencies remain external, tarballs use an allowlist, and all TenetKit packages in one release use one exact version.

`bun run package` builds once and packs exactly `tenetkit`, `pg`, `mysql`, and `cloudflare` without mutating source manifests. Bun resolves workspace and catalog protocols. Verification rejects unsafe inventory, missing or inconsistent MIT license metadata, and unresolved protocols; checks exports, exact internal dependencies, Effect identity, and size ceilings; then installs all four tarballs in clean Bun-isolated and npm consumers. Wildcard export specifiers are checked by resolving the pattern rather than the literal path.

The packed smoke also imports every documented Worker-safe TenetKit subpath from those fresh consumers. It bundles neutral Core, MCP HTTP/OAuth, and Runtime entrypoints separately from OpenRouter with Wrangler and no Node compatibility flags, rejects Node/Bun builtins, stdio, SQL drivers, SQLite, AWS/Bedrock, and provider dependencies in the neutral graph, then loads each emitted bundle with the pinned real `workerd` binary. A successful bundle alone is not conformance: the graph gate proves forbidden modules are absent, while workerd proves the emitted module initializes in the Worker runtime.

The command emits four versioned tarballs, `release-evidence.json`, and `SHA256SUMS`. A `v<version>` tag push for the committed lockstep version publishes those same six assets as a GitHub release and the exact four tarballs to npm. A manual run can reconcile one existing immutable tag and commit. Publication verifies registry integrity and never rebuilds downstream artifacts.

Effect is one exact peer across TenetKit packages. Consumer verification proves one physical Effect installation for the workspace-pinned release candidate.

Every public AI specifier has an exact dependency closure. The neutral `tenetkit/ai`, catalog, deterministic, and model-route entries install and typecheck with zero provider peers; each provider or embedding entry requires only its named optional peer. Packed smoke verifies full declarations for the zero-provider neutral entry and verifies runtime plus consumer types for an OpenRouter-only install.
