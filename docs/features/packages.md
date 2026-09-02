# Extension packages

Generalist can install instructions, skills, and tools from npm packages or immutable GitHub archives. Resolution happens once while `PackageCatalog.layer` is constructed. The catalog uses Effect `HttpClient`, `FileSystem`, `Path`, and `Crypto` services and writes a Schema-validated lock file containing the exact npm version or Git commit and archive integrity.

```ts
import { PackageCatalog } from "generalist/instructions"

const packages = PackageCatalog.layer({
  packages: ["@acme/generalist-skills-sql@^1", "github:acme/generalist-skill-review#v2"],
  cacheDir: ".generalist/packages",
  lock: ".generalist/packages.lock",
  allowTools: true,
})
```

The service exposes `instructions`, `skills`, `toolkit`, and `handlers`. Compose the instruction and skill values with `Instructions.layer` and `SkillCatalog.layer`, pass `catalog.toolkit` to `Agent.make`, and provide `catalog.handlers` where the agent runs. Tool calls then follow the normal Generalist authorization path through `Permissions` and `Approvals`.

Tools are disabled by default. Both the package manifest's `tools` path and `allowTools: true` are required before Generalist imports executable package code.

## Package manifest

A package is a normal npm package with a `generalist` field:

```json
{
  "name": "@acme/generalist-skills-sql",
  "version": "1.0.0",
  "type": "module",
  "files": ["AGENTS.md", "dist", "skills"],
  "generalist": {
    "instructions": ["AGENTS.md"],
    "skills": ["skills/*/SKILL.md"],
    "tools": "dist/tools.js"
  }
}
```

`instructions` and `skills` are arrays of safe package-relative glob patterns. Skills use the standard `SKILL.md` format and their directory must match the frontmatter name. The optional tools module exports an Effect `Toolkit` as `toolkit` and its self-contained handler Layer as `handlerLayer`.

Package tool modules should be bundled except for host peer dependencies such as `effect` and `generalist`. The catalog fetches the selected package archive directly; it does not run npm lifecycle scripts or invoke npm or git.

## Resolution and integrity

- npm specifiers support exact versions, dist-tags, major/minor wildcards, and `^` or `~` ranges. Metadata and `.tgz` archives come directly from the configured npm registry.
- Git packages use `github:owner/repository#ref`. The catalog resolves the ref through GitHub's commit API, locks the 40-character commit SHA, and downloads that commit's archive endpoint. It does not shell out to git.
- Cached archives are hashed on every Layer construction. A changed package list, package identity, or archive hash fails with `PackageIntegrityMismatch` instead of silently rewriting the lock.
- Remove the lock file deliberately to select newer matching npm versions or move a Git ref.

Publish the package with the normal npm publishing flow after checking that every path in `generalist` is included by `files`. The workspace reference package at `examples/packages/generalist-skills-example` demonstrates the complete shape; publishing it under the organization is a follow-up release action.
