# 07 — Skills

Baton skills follow the agentskills.io `SKILL.md` directory format: a skill is a directory containing a `SKILL.md` file with YAML-style frontmatter and a Markdown body. Baton models skills as pure context and tool assembly. Concrete discovery lives outside core in `@batonfx/skills`.

## Scope

Baton owns:

- the core `SkillSource` seam;
- listing selection for progressive disclosure;
- loop integration for startup listing injection and `activate_skill` body loading;
- a filesystem-backed source package, `@batonfx/skills`;
- one provider-neutral source composer;
- Baton-manifest-backed HTTP, S3, and GitHub source adapters in `@batonfx/skills`;
- an instruction-file loader for `AGENTS.md` / `CLAUDE.md` files.

Baton does not own a hosted registry service, publishing workflow, native bucket/repository enumeration, AWS signing, GitHub authentication, durable skill registry, shell templating, or context-fork subagent execution in this milestone. The Agent Skills standard defines skill contents but no hosted distribution protocol; Baton's hosted manifest is an integration contract, not a claim of upstream conformance.

## Core seam

`@batonfx/core` exports `SkillSource` from `packages/core/src/skill-source.ts`. Core depends only on `effect`; it never reads the filesystem.

A `Skill` contains parsed frontmatter, a startup `listing`, a lazy `body` effect, and optional contributed `Ai.Tool` values. `SkillSource.all` returns discovered skills, and `SkillSource.get(name)` resolves one skill by name. `fromSkills`, `empty`, and `testLayer` provide memory/test layers.

`SkillSource.Source<R>` is an Effect that builds one `SkillSource.Interface`. `SkillSource.layer(sources)` evaluates sources fail-fast and merges them. Later sources win duplicate names; `all` and `get` expose the same winner in deterministic source order. `SkillSource.merge` composes already-built interfaces with the same rules.

Frontmatter fields are:

- `name`
- `description`
- `whenToUse`
- `allowedTools`
- `disableModelInvocation`
- `userInvocable`
- `contextFork`
- `agent`
- `model`
- `paths`

The standard fields `name` and `description` are required. `name` is 1–64 lowercase alphanumeric or hyphen characters, cannot begin or end with a hyphen, cannot contain consecutive hyphens, and must equal the directory containing `SKILL.md`. `description` is non-empty and at most 1024 characters. Baton stores the standard space-separated `allowed-tools` value as `allowedTools: ReadonlyArray<string>`. The remaining fields are explicitly Baton/host compatibility extensions rather than fields defined by the Agent Skills standard.

## Progressive disclosure

Startup context contains only selected listings: `- name: capped description`. The description cap is `DESCRIPTION_CAP = 1024` characters, matching the standard description limit. `selectListings(skills, budgetTokens, recentlyUsed)` estimates listing cost with a stable approximation, excludes `disableModelInvocation` skills, and drops least-recently-used skills first when over budget while preserving source order among selected skills.

When `SkillSource` is present, `Agent.stream` appends selected listings to the system baseline and advertises the reserved built-in `activate_skill` tool. The complete initial set is validated before advertisement, including collisions between static declarations and the built-in. The model activates a listed skill by calling `activate_skill` with `{ name }`. Baton handles that call through `SkillSource.get(name)`, prospectively validates all contributed `Skill.tools` against the current set, then evaluates the selected `Skill.body` and atomically publishes the body and validated set for the next model turn. Validation failure leaves the current run-local set unchanged and fails with ordered static, built-in, or skill origin evidence before the body is read or another model request occurs. Missing and non-model-invocable skills use the built-in tool's declared structured domain-failure schema. Non-activated skill bodies are not read. Contributed skill tools dispatch through `ToolExecutor`; if it is absent, calling one fails with `FrameworkFailure { stage: "missing-handler" }`. The agent's static toolkit remains locally handled.

The Markdown body is loaded only by evaluating `Skill.body`. Supporting files are not loaded automatically in v1; consumers can expose read tools or package-specific loaders later.

## Filesystem loader

`@batonfx/skills` provides `SkillLoader.layer(options)` over `effect`'s `FileSystem` and `Path` services.

Default roots are searched in order relative to `cwd`:

1. `.agents/skills`
2. `.claude/skills`
3. `.pi/skills`

Missing roots are skipped. Later roots win name collisions. Nested directory paths are discovery locations only: `frontend/lint/SKILL.md` must declare `name: lint`, matching its immediate directory.

The parser supports a small flat frontmatter subset: scalar strings, booleans, inline string arrays, and block string arrays. Standard `allowed-tools` is parsed from a space-separated scalar; array-valued `allowedTools` remains a Baton compatibility extension. Unknown keys are ignored. It deliberately does not support nested YAML, multiline scalars, anchors, tags, arbitrary expressions, or a heavy YAML dependency.

Discovery reads only enough text to parse frontmatter. The full `SKILL.md` body is read lazily through `Skill.body`.

`SkillLoader.make(options)` returns a composable `SkillSource.Source`; `SkillLoader.layer(options)` remains the one-source convenience.

## Hosted manifest

`@batonfx/skills` defines one versioned JSON manifest for hosted adapters:

```json
{
  "version": 1,
  "skills": [
    {
      "name": "triage",
      "description": "Triage support incidents",
      "skillPath": "support/triage/SKILL.md",
      "sha256": "<64 lowercase hex characters>"
    }
  ]
}
```

Each entry contains the complete supported startup frontmatter (`name`, `description`, and the optional fields listed above), plus a relative `skillPath` and required SHA-256 digest of the full UTF-8 `SKILL.md` document. Names must be unique and satisfy the same standard constraints as filesystem skills. The path's immediate parent directory must equal the skill name. Paths must be non-empty relative slash-separated paths without `.` / `..`, backslashes, percent escapes, query strings, fragments, or cross-origin resolution.

The manifest snapshot is fetched and schema-validated once when the source is built. Manifest and body limits are enforced while streaming raw response bytes, before the complete response is buffered. Startup discovery does not fetch bodies. `Skill.body` fetches the canonical document lazily, hashes the exact received bytes through Effect `Crypto`, decodes UTF-8 strictly, parses the same frontmatter subset as the filesystem loader, and rejects a manifest/document frontmatter mismatch. Baton's agent loop caches each successfully activated body for one run; direct source callers may fetch again. Failed body reads are retryable.

Hosted manifests never deserialize executable tools. A trusted host may attach in-process Effect AI tools through `toolsBySkill`; otherwise hosted skills contribute no tools.

HTTP failures, invalid status, malformed JSON/frontmatter, invalid UTF-8, limit violations, unsafe paths, digest mismatches, and metadata mismatches map to `SkillSourceError`. Diagnostic `source` values come from caller-safe catalog identifiers and never include URL userinfo, query strings, fragments, or authorization values.

The hosted manifest schema, URL resolvers, request headers, and shared constructor are package internals owned by the supported adapters. `@batonfx/skills` does not expose a generic hosted-catalog namespace or transport extension point. A new transport contract requires a separately accepted use case and security contract rather than exposing the built-in engine's implementation options.

## Hosted providers

- `HttpCatalog.make({ manifestUrl, ...limits })` loads a manifest over the ambient Effect `HttpClient`. Skill paths resolve relative to the manifest URL and must remain same-origin and beneath the manifest directory. Diagnostics use the parsed URL origin and path, excluding credentials, query, and fragment.
- `S3Catalog.make({ bucket, region, prefix?, manifestName?, ...limits })` is a virtual-hosted HTTPS preset over the same manifest protocol. Because AWS wildcard TLS does not cover dotted bucket names, this preset accepts only DNS-compatible non-dotted bucket names. It does not call `ListObjectsV2` or sign requests. Public access, presigning, credentials, retries, and SigV4 come from the caller-provided `HttpClient`.
- `GitHubCatalog.make({ owner, repo, ref, root?, manifestName?, apiBaseUrl?, ...limits })` reads the manifest and bodies through the GitHub Contents API with the raw media type. Owner and repository components are validated before URL construction; `apiBaseUrl` must be an absolute HTTPS URL without credentials, query, or fragment. `ref` must be an immutable 40- or 64-character hexadecimal commit id. It does not enumerate trees or accept a mutable branch/tag. Authentication, retries, and rate-limit policy come from the caller-provided `HttpClient`.

S3 diagnostics identify the bucket and prefix; GitHub diagnostics identify the repository and immutable ref. Provider options do not accept an alternate diagnostic `source`. Hosted request failures preserve the typed `SkillSourceError` boundary but omit the underlying HTTP error cause because it owns the request URL and decorated headers and is therefore not safe to encode or log.

Each module also exposes `layer(options)` as a one-source convenience. None adds built-in refresh or retry behavior; rebuild the layer to refresh a manifest and decorate `HttpClient` for transport policy.

## Instruction files

`@batonfx/skills` also exports `InstructionFiles.loadInstructionFiles(options)`.

Default filenames are `AGENTS.md` then `CLAUDE.md`. For each directory, the first existing filename wins, so `AGENTS.md` overrides `CLAUDE.md`. Ancestors are returned in root-to-cwd order so nearest-cwd instructions are last and highest priority. Explicit `globalFiles` are returned before ancestor files. File contents are returned verbatim for consumers to pass to the `Instructions` registry.

## Integration

Consumers provide `SkillSource` as an optional Effect service. Local filesystem discovery and Relay's durable pinned-snapshot registry both adapt to the same `SkillSource.Interface`, so the loop activation path is identical for standalone Baton and durable hosts. `contextFork`, `agent`, and `model` are parsed metadata only until multi-agent support lands.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/03-instructions-and-context-epoch.md`
- `docs/spec/decisions/ADR-0010-adopt-agentskills-standard.md`
- `docs/spec/decisions/ADR-0019-manifest-backed-hosted-skills.md`
