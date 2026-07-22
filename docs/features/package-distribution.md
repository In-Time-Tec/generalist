# Package distribution

Public packages ship compiled ESM and declarations under `dist/`. Export maps point only to built files and list types before imports. Baton and third-party dependencies remain external, tarballs use an allowlist, and all Baton packages in one release use one exact version.

`bun run package` builds once and packs exactly `core`, `test`, `skills`, `memory`, `providers`, `mcp`, `transport`, and `foldkit` without mutating source manifests. Bun resolves workspace and catalog protocols. Verification rejects unsafe inventory and unresolved protocols, checks metadata, exports, exact internal dependencies, Effect identity, and size ceilings, then installs all eight tarballs in clean Bun-isolated and npm consumers.

The command emits eight versioned tarballs, `release-evidence.json`, and `SHA256SUMS`. A `v<version>` tag push for the committed lockstep version may publish those same ten assets as a GitHub release. Manual runs verify and attest assets but never release them. Baton does not publish to npm.

Effect is one exact peer across Baton packages. Consumer verification proves one physical Effect installation. npm uses legacy peer resolution only for the known external `foldkit@0.122.0` beta.88 declaration; runtime identity remains beta.98.
