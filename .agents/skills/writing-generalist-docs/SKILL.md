---
name: writing-generalist-docs
description: Writes concise Generalist tutorials and guides with verified examples. Use when changing public documentation, examples in docs, or onboarding content.
---

# Write for one reader goal

Read the owning implementation and current examples before writing. Lead with the reader's problem, explain why the mechanism helps, and show a concrete outcome. Give tutorials a goal, prerequisites, one working example and expected output, a likely failure and remedy, and one next step. Use plain language, active voice, and short sections. Keep product claims evidence-backed; cut hype and explanations that repeat the code.

Product introductions should make the case for durable agent work without making Runtime a prerequisite for the process-local loop. Architecture guides should descend from the whole system into ownership, data flow, and recovery, using diagrams that distinguish durable authority from compute, caches, and provisional output. Comparisons need first-party sources and explicit differences; another system's scale or cost numbers are not Generalist benchmarks. Reference pages should remain concise technical references, not repeated pitches.

- Use Effect AI's actual Prompt, Response, Tool, and Toolkit types. Do not invent a parallel contract.
- Separate scripted models, canned tool data, live model calls, and live external services. Name required credentials and costs.
- Distinguish process-local execution from persistent Runtime recovery. Memory storage is not restart-safe.
- Explain who authenticates users and authorizes resources. Do not imply built-in tenant identity or secure sandboxing.
- Match install versions to package manifests and Effect peers. Public exports are experimental, not promised stable.
- Keep generated API signatures authoritative. Link design references only when the reason helps the task.
- Mark fragments as fragments. Include every file, import, service Layer, and disposal step needed by runnable code.

## Before and after

Before: “Seamlessly unlock production-grade research with one environment variable.”

After: “Set `OPENROUTER_API_KEY` to use a live model. Search still returns canned results. The repository example also supports live Exa search with `EXA_API_KEY`; this tutorial does not.”

## Verify, then report

Run `bun run readme:check` for public install-version drift and extracted tutorial checks; extend that existing script when adding runnable onboarding code. Run the real example and compare its output. Typechecking a fragment is not execution evidence. Do not claim provider, database, search, or usability verification when it was skipped.

Run `bun run docs:build`, `bun run docs:api:check`, and formatting checks for changed paths. For rendered content or navigation, use the local Mintlify preview and inspect desktop/mobile light/dark screenshots plus keyboard navigation and code-copy behavior. Follow `writing-mintlify-docs` for site configuration. Report checks and limitations without creating a second documentation toolchain.
