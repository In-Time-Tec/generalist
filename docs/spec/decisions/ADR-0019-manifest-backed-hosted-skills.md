# ADR-0019 — Manifest-backed Hosted Skills

## Status

Accepted.

## Context

The Agent Skills standard defines the contents of skill directories but does not define hosted catalogs, manifests, HTTP discovery, S3 enumeration, or GitHub distribution. Baton already has a provider-neutral `SkillSource` seam and a filesystem adapter. Cloud and sandbox hosts need remote skill snapshots without adding provider SDKs or network behavior to core.

## Decision

Define a small versioned Baton manifest carrying complete startup frontmatter, a safe relative `SKILL.md` path, and a required SHA-256 digest. Implement generic HTTP plus thin S3 and GitHub endpoint presets in `@batonfx/skills` over the ambient Effect `HttpClient` and `Crypto` services.

S3 uses a fixed manifest object and performs no bucket listing or signing. GitHub uses the Contents API at a required immutable commit and performs no tree enumeration. Authentication, signing, retry, cache, and rate-limit policy remain caller-owned `HttpClient` decoration. Core owns only source composition and does not depend on HTTP, filesystems, or provider clients.

The HTTP, S3, and GitHub modules are the complete public hosted-catalog construction boundary. The shared manifest schemas, URL resolvers, headers, limits plumbing, and constructor remain internal to `@batonfx/skills`; there is no generic hosted-catalog namespace or transport extension point. No accepted consumer requires custom transport construction, and exposing implementation-shaped options would transfer Baton's URL, integrity, and diagnostic-safety invariants to callers without a stable contract.

Each public adapter derives its diagnostic identifier from validated provider inputs. Callers cannot override it. HTTP identifiers retain only parsed origin and path, S3 identifiers name the bucket and prefix, and GitHub identifiers name the repository and immutable ref. Request failures do not retain the underlying Effect HTTP error as a public cause because it contains the complete request URL and may contain caller-decorated authorization headers. Other hosted validation and integrity failures retain typed, schema-backed `SkillSourceError` values without changing requirements or laziness.

## Consequences

- Filesystem and hosted sources share one lazy activation path.
- Startup listings are available from one bounded manifest request without eagerly downloading skill bodies.
- Digest and frontmatter verification bind activated content to the discovered snapshot.
- Response limits apply to streamed raw bytes; digests cover those exact bytes and text decoding rejects invalid UTF-8.
- Provider presets validate URL components and redact credentials from diagnostics.
- The package root exposes only the supported `HttpCatalog`, `S3Catalog`, and `GitHubCatalog` namespaces; custom hosted transports require a future ADR and public security contract.
- Provider-specific diagnostics remain useful without accepting caller-defined identifiers or retaining request URLs and headers in encoded error causes.
- Baton does not claim its manifest is part of the Agent Skills standard.
- Native provider discovery and hosted registry operation remain outside Baton.

## Related docs

- `docs/spec/07-skills.md`
- `docs/spec/decisions/ADR-0010-adopt-agentskills-standard.md`
