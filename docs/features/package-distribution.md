# Package distribution

Public packages ship compiled ESM and declarations under `dist/`. Export maps point only to built files and list types before imports. Baton and third-party dependencies remain external, tarballs use an allowlist, and all Baton packages in one release use one exact version.

`bun run package` builds once and packs exactly `a2a`, `ag-ui`, `core`, `foldkit`, `harness`, `mcp`, `memory`, `providers`, `repl`, `runtime`, `skills`, `test`, and `transport` without mutating source manifests. Bun resolves workspace and catalog protocols. Verification rejects unsafe inventory and unresolved protocols, checks metadata, exports, exact internal dependencies, Effect identity, and size ceilings, then installs all thirteen tarballs in clean Bun-isolated and npm consumers.

The command emits thirteen versioned tarballs, `release-evidence.json`, and `SHA256SUMS`. A `v<version>` tag push for the committed lockstep version publishes those same fifteen assets as a GitHub release and the exact thirteen tarballs to npm. A manual run can reconcile one existing immutable tag and commit. Publication verifies registry integrity and never rebuilds downstream artifacts.

Effect is one exact peer across Baton packages. Consumer verification proves one physical Effect installation. npm uses legacy peer resolution only for the known external `foldkit@0.122.0` beta.88 declaration; runtime identity remains beta.98.
