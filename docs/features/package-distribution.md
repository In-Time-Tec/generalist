# Package distribution

Public packages ship compiled ESM and declarations under `dist/`. Export maps point only to built files and list types before imports. TenetKit and third-party dependencies remain external, tarballs use an allowlist, and all TenetKit packages in one release use one exact version.

`bun run package` builds once and packs exactly `tenetkit`, `pg`, `mysql`, and `cloudflare` without mutating source manifests. Bun resolves workspace and catalog protocols. Verification rejects unsafe inventory and unresolved protocols, checks metadata, exports, exact internal dependencies, Effect identity, and size ceilings, then installs all four tarballs in clean Bun-isolated and npm consumers. Wildcard export specifiers are checked by resolving the pattern rather than the literal path.

The command emits four versioned tarballs, `release-evidence.json`, and `SHA256SUMS`. A `v<version>` tag push for the committed lockstep version publishes those same six assets as a GitHub release and the exact four tarballs to npm. A manual run can reconcile one existing immutable tag and commit. Publication verifies registry integrity and never rebuilds downstream artifacts.

Effect is one exact peer across TenetKit packages. Consumer verification proves one physical Effect installation for the workspace-pinned release candidate.
