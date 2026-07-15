# Changelog

## 0.5.0

- Reject ambiguous static, reserved `activate_skill`, activated-skill, and Handoff tool names with schema-backed origin evidence before advertisement or execution. Use `Agent.make({ tools: [...] })` when duplicate static declarations must remain observable; pre-built Effect AI toolkits remain accepted, but `Toolkit.make` has already erased duplicate inputs.
- Add the public Effect-native `@batonfx/mcp` OAuth lifecycle, host-owned redacted token store, typed lifecycle errors, authenticated remote transport integration, and deterministic layers.
- Add scripted reasoning parts to `@batonfx/test` with deterministic reasoning stream events and transcript projection distinct from assistant text.
- Preserve host `HttpClient` requirements in base provider, preset, fallback, and embedding constructors; use the matching explicitly named `*Fetch` convenience to retain the previous fetch-backed behavior.
- Preserve typed FoldKit connection and command failures as structured facts while leaving defects and interruption in their Effect causes; `ChatCommand` now exposes its concrete error union instead of `any`.
