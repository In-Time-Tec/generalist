# Operation memoization

Generalist can reuse successful declared-pure tool calls across Runs. Memoization is opt-in per tool, and the journal remains authoritative for replay.

## Usage

```ts
import { Layer, Schema, pipe } from "effect"
import { Tool } from "effect/unstable/ai"
import { Memo } from "generalist"

const Search = pipe(
  Tool.make("search", {
    parameters: Schema.Struct({ query: Schema.String }),
    success: Schema.Array(Schema.String),
  }),
  Memo.pure({ ttl: "6 hours", dependsOn: ["index-version"] }),
)

const memo = Layer.merge(
  Memo.layerMemory(),
  Memo.layerDependencies({
    tenant: "tenant-42",
    capabilityScope: "search:read",
    versions: { "index-version": "2026-09-02" },
  }),
)
```

Use `Memo.layerSql()` instead of `layerMemory()` when entries must survive process restarts. The SQL layer uses `generalist_memo_entries` from Runtime SQL schema version 7, so apply the Runtime schema before constructing the layer.

## Identity and replay

The tool key is SHA-256 over the tool name, canonical JSON arguments, named dependency versions, tenant, and capability scope. A missing `Memo.Dependencies` or store disables reuse rather than guessing an isolation boundary. Non-JSON transformed arguments also bypass memoization.

A cache hit becomes the normal durable tool operation result and emits a `ToolExecutionCompleted.result.memoized` value with `fromRun` and `fromOperation`. Strict replay decodes that recorded operation and never reads the memo store.

Only successful outcomes are stored. Domain failures, suspensions, framework failures, undeclared tools, skill activation, and handoffs are not cached. Expiry uses the Effect `Clock`, so `TestClock` controls it in tests.

## Model calls

`Memo.models({ enabled: true })` is passed to `layerMemory({ models })` or `layerSql({ models })` to opt a temperature-0 model into prompt-keyed reuse. Hosts must configure the provider at temperature 0; Effect AI's provider-neutral `LanguageModel` interface does not expose provider sampling settings for Generalist to inspect.

## Purity rule and limits

`no-unsafe-memo-pure` rejects direct `Memo.pure` use in a source module that also directly uses `Sandbox`, `SqlClient`, or common non-GET `HttpClient` methods. It is intentionally best effort: aliases, wrapper services, dynamic SQL, and transitive side effects cannot be proven statically. Reviewers and tool authors still own the purity claim. Prefer putting a pure tool and handler in a small module so the rule has a clear boundary.

`Memo.layerRedis` is not included. Generalist adds no Redis dependency; hosts can implement durable reuse with the SQL layer.

## Invariants

- No `Memo.pure` declaration means no tool cache lookup or write.
- Tenant and capability scope are key material, never inferred from a Session.
- Dependency version changes invalidate prior entries without deleting them.
- Cache failures are best effort and fall through to live dispatch.
- Replay and recovery never consult mutable memo state.
