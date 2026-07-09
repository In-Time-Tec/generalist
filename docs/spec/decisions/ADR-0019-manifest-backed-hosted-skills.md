# ADR-0019 — Manifest-backed Hosted Skills

## Status

Accepted.

## Context

The Agent Skills standard defines the contents of skill directories but does not define hosted catalogs, manifests, HTTP discovery, S3 enumeration, or GitHub distribution. Baton already has a provider-neutral `SkillSource` seam and a filesystem adapter. Cloud and sandbox hosts need remote skill snapshots without adding provider SDKs or network behavior to core.

## Decision

Define a small versioned Baton manifest carrying complete startup frontmatter, a safe relative `SKILL.md` path, and a required SHA-256 digest. Implement generic HTTP plus thin S3 and GitHub endpoint presets in `@batonfx/skills` over the ambient Effect `HttpClient` and `Crypto` services.

S3 uses a fixed manifest object and performs no bucket listing or signing. GitHub uses the Contents API at a required immutable commit and performs no tree enumeration. Authentication, signing, retry, cache, and rate-limit policy remain caller-owned `HttpClient` decoration. Core owns only source composition and does not depend on HTTP, filesystems, or provider clients.

## Consequences

- Filesystem and hosted sources share one lazy activation path.
- Startup listings are available from one bounded manifest request without eagerly downloading skill bodies.
- Digest and frontmatter verification bind activated content to the discovered snapshot.
- Response limits apply to streamed raw bytes; digests cover those exact bytes and text decoding rejects invalid UTF-8.
- Provider presets validate URL components and redact credentials from diagnostics.
- Baton does not claim its manifest is part of the Agent Skills standard.
- Native provider discovery and hosted registry operation remain outside Baton.

## Related docs

- `docs/spec/07-skills.md`
- `docs/spec/decisions/ADR-0010-adopt-agentskills-standard.md`
