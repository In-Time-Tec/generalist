# BatonFX Specification Index

`SPEC.md` is the root index for BatonFX's specification tree. BatonFX is a standalone, non-durable, Effect-native agent framework built on `effect/unstable/ai`. Compose it directly into your own Effect app; back it with a durable runtime such as [Relay](https://github.com/In-Time-Tec/relayfx) when you need suspend/resume durability.

## How to read this tree

Read `CONTEXT.md` for the vocabulary, then this index, then the feature branch under `docs/spec/`. Stable decisions have an ADR under `docs/spec/decisions/`. If implementation discovers a new invariant, update the feature document and add or amend an ADR before changing code.

```diagram
SPEC.md
├─ CONTEXT.md                                  vocabulary
├─ docs/spec/
│  ├─ 01-baton-agent-framework.md              the agent loop contract
│  ├─ 02-session-event-log.md                  session log and projector contract
│  ├─ 03-instructions-and-context-epoch.md     instructions registry and context epoch contract
│  ├─ 04-permissions-policy.md                 tool permissions policy contract
│  ├─ 05-steering-and-interrupts.md            steering queues and interrupt contract
│  ├─ 06-compaction.md                         compaction strategy and loop integration contract
│  ├─ 07-skills.md                             skill source and filesystem loader contract
│  ├─ 08-providers.md                          provider registration helper contract
│  ├─ 09-memory.md                             recall and remember seam contract
│  ├─ 10-multi-agent.md                        in-process multi-agent contract
│  ├─ 11-transport.md                          wire frames and in-process session registry contract
│  ├─ 12-foldkit-adapter.md                    FoldKit resource/subscription/chat adapter contract
│  ├─ 13-test-kit.md                           deterministic scripted model and capture contract
│  ├─ 14-package-distribution.md               compiled artifacts and release verification
│  ├─ 15-mcp-oauth.md                           MCP tool payload and OAuth lifecycle boundaries
│  └─ 16-mcp-baton-tools.md                     scoped MCP connection and Baton tool integration
└─ docs/spec/decisions/
   ├─ ADR-0001-baton-standalone-agent-framework.md
   ├─ ADR-0002-tool-context-output-spill.md
   ├─ ADR-0003-model-resilience.md
   ├─ ADR-0004-guardrail-combinators.md
   ├─ ADR-0005-session-event-log.md
   ├─ ADR-0006-instructions-context-epoch.md
   ├─ ADR-0007-permissions-policy-seam.md
   ├─ ADR-0008-steering-and-run-interrupts.md
   ├─ ADR-0009-compaction-strategy-seam.md
   ├─ ADR-0010-adopt-agentskills-standard.md
   ├─ ADR-0011-provider-registration-helpers.md
   ├─ ADR-0012-model-metadata-catalog.md
   ├─ ADR-0013-in-process-multi-agent.md
   ├─ ADR-0014-transport-wire-and-session-registry.md
   ├─ ADR-0015-transport-sse-websocket-client.md
   ├─ ADR-0016-foldkit-adapter.md
   ├─ ADR-0017-effect-toolkit-as-tool-runtime.md
   ├─ ADR-0018-in-process-session-run-queue.md
   ├─ ADR-0019-manifest-backed-hosted-skills.md
   ├─ ADR-0020-public-deterministic-test-model.md
   ├─ ADR-0021-portable-turn-policy-snapshots.md
   ├─ ADR-0022-compiled-esm-package-artifacts.md
   ├─ ADR-0023-mcp-oauth-lifecycle.md
   ├─ ADR-0024-public-api-import-and-layer-conventions.md
   ├─ ADR-0025-authoritative-transformed-response.md
   ├─ ADR-0026-working-memory-summary-model.md
   ├─ ADR-0027-memory-item-user-content.md
   ├─ ADR-0028-scoped-mcp-baton-tools.md
   ├─ ADR-0029-mcp-remote-payload-decoding.md
   └─ ADR-0030-effectful-turn-policy-stop-reasons.md
```

## Packages

| Package              | npm                  | Directory            | Purpose                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@batonfx/core`      | `@batonfx/core`      | `packages/core`      | The Effect-native agent loop: Agent, Instructions, Session, SkillSource, Steering, Compaction, structured output, TurnPolicy, ToolExecutor, ToolContext, ToolOutputStore, Permissions, Approvals, ModelRegistry, ModelResilience, ModelMiddleware, Guardrail combinators, chat persistence seam. |
| `@batonfx/foldkit`   | `@batonfx/foldkit`   | `packages/foldkit`   | FoldKit adapter: shared transport connection resource, subscriptions, commands, and a headless chat submodel.                                                                                                                                                                                    |
| `@batonfx/memory`    | `@batonfx/memory`    | `packages/memory`    | Non-durable memory layers for the core seam: in-process vector store, semantic recall over Effect AI embeddings, bounded working memory, and combined composition.                                                                                                                               |
| `@batonfx/mcp`       | `@batonfx/mcp`       | `packages/mcp`       | MCP client bridge: discover an MCP server's tools as an `Ai.Toolkit` plus a Baton `ToolExecutor` adapter (`@batonfx/mcp/baton`).                                                                                                                                                                 |
| `@batonfx/providers` | `@batonfx/providers` | `packages/providers` | Provider registration helpers, OpenAI-compatible presets, deterministic model registration, and embedding layers over upstream Effect AI provider packages.                                                                                                                                      |
| `@batonfx/skills`    | `@batonfx/skills`    | `packages/skills`    | Filesystem and manifest-backed HTTP/S3/GitHub `SKILL.md` sources plus instruction-file discovery for core seams.                                                                                                                                                                                 |
| `@batonfx/test`      | `@batonfx/test`      | `packages/test`      | Scripted Effect AI language-model fixtures, normalized request capture, and reusable model-registry layers for deterministic agent tests.                                                                                                                                                        |
| `@batonfx/transport` | `@batonfx/transport` | `packages/transport` | Replayable wire frames, in-process `SessionRegistry`, and thin SSE/WebSocket/client adapters for non-durable chat transports.                                                                                                                                                                    |

## Feature branches

- Agent framework contract: `docs/spec/01-baton-agent-framework.md`
- Session event-log contract: `docs/spec/02-session-event-log.md`
- Instructions and context-epoch contract: `docs/spec/03-instructions-and-context-epoch.md`
- Permissions policy contract: `docs/spec/04-permissions-policy.md`
- Steering and interrupts contract: `docs/spec/05-steering-and-interrupts.md`
- Compaction strategy contract: `docs/spec/06-compaction.md`
- Skills contract: `docs/spec/07-skills.md`
- Providers contract: `docs/spec/08-providers.md`
- Memory contract: `docs/spec/09-memory.md`
- In-process multi-agent contract: `docs/spec/10-multi-agent.md`
- Transport contract: `docs/spec/11-transport.md`
- FoldKit adapter contract: `docs/spec/12-foldkit-adapter.md`
- Deterministic test-kit contract: `docs/spec/13-test-kit.md`
- Package distribution contract: `docs/spec/14-package-distribution.md`
- MCP contract: `docs/spec/15-mcp-oauth.md`
- MCP Baton tools contract: `docs/spec/16-mcp-baton-tools.md`

## Decisions

- ADR-0001 — Baton Standalone Agent Framework: `docs/spec/decisions/ADR-0001-baton-standalone-agent-framework.md`
- ADR-0002 — Tool Context and Output Spill: `docs/spec/decisions/ADR-0002-tool-context-output-spill.md`
- ADR-0003 — Model Resilience: `docs/spec/decisions/ADR-0003-model-resilience.md`
- ADR-0004 — Guardrail Combinators: `docs/spec/decisions/ADR-0004-guardrail-combinators.md`
- ADR-0005 — Session Event Log: `docs/spec/decisions/ADR-0005-session-event-log.md`
- ADR-0006 — Instructions Context Epoch: `docs/spec/decisions/ADR-0006-instructions-context-epoch.md`
- ADR-0007 — Permissions Policy Seam: `docs/spec/decisions/ADR-0007-permissions-policy-seam.md`
- ADR-0008 — Steering and Run Interrupts: `docs/spec/decisions/ADR-0008-steering-and-run-interrupts.md`
- ADR-0009 — Compaction Strategy Seam: `docs/spec/decisions/ADR-0009-compaction-strategy-seam.md`
- ADR-0010 — Adopt the agentskills.io Skill Format: `docs/spec/decisions/ADR-0010-adopt-agentskills-standard.md`
- ADR-0011 — Provider Registration Helpers: `docs/spec/decisions/ADR-0011-provider-registration-helpers.md`
- ADR-0012 — Model Metadata Catalog: `docs/spec/decisions/ADR-0012-model-metadata-catalog.md`
- ADR-0013 — In-process Multi-agent: `docs/spec/decisions/ADR-0013-in-process-multi-agent.md`
- ADR-0014 — Transport Wire and Session Registry: `docs/spec/decisions/ADR-0014-transport-wire-and-session-registry.md`
- ADR-0015 — Transport SSE, WebSocket, and Client Adapters: `docs/spec/decisions/ADR-0015-transport-sse-websocket-client.md`
- ADR-0016 — FoldKit Adapter: `docs/spec/decisions/ADR-0016-foldkit-adapter.md`
- ADR-0017 — Effect Toolkit as Tool Runtime: `docs/spec/decisions/ADR-0017-effect-toolkit-as-tool-runtime.md`
- ADR-0018 — In-process Session Run Queue: `docs/spec/decisions/ADR-0018-in-process-session-run-queue.md`
- ADR-0019 — Manifest-backed Hosted Skills: `docs/spec/decisions/ADR-0019-manifest-backed-hosted-skills.md`
- ADR-0020 — Public Deterministic Test Model: `docs/spec/decisions/ADR-0020-public-deterministic-test-model.md`
- ADR-0021 — Portable Turn Policy Snapshots: `docs/spec/decisions/ADR-0021-portable-turn-policy-snapshots.md`
- ADR-0022 — Compiled ESM Package Artifacts: `docs/spec/decisions/ADR-0022-compiled-esm-package-artifacts.md`
- ADR-0023 — MCP OAuth Lifecycle: `docs/spec/decisions/ADR-0023-mcp-oauth-lifecycle.md`
- ADR-0024 — Public API Import and Layer Conventions: `docs/spec/decisions/ADR-0024-public-api-import-and-layer-conventions.md`
- ADR-0025 — Authoritative Transformed Response: `docs/spec/decisions/ADR-0025-authoritative-transformed-response.md`
- ADR-0026 — Working-memory Summary Model Composition: `docs/spec/decisions/ADR-0026-working-memory-summary-model.md`
- ADR-0027 — Memory Item User Content: `docs/spec/decisions/ADR-0027-memory-item-user-content.md`
- ADR-0028 — Scoped MCP Baton Tools: `docs/spec/decisions/ADR-0028-scoped-mcp-baton-tools.md`
- ADR-0029 — MCP Remote Payload Decoding: `docs/spec/decisions/ADR-0029-mcp-remote-payload-decoding.md`
- ADR-0030 — Effectful Turn Policy Stop Reasons: `docs/spec/decisions/ADR-0030-effectful-turn-policy-stop-reasons.md`
