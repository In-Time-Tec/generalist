---
title: "generalist/unstable/ag-ui"
description: "AG-UI 0.0.57 event projection over authoritative Runtime runs."
---

generalist/unstable/ag-ui projects canonical Runtime runs into AG-UI events.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist @ag-ui/core@0.0.57
```

`generalist/unstable/ag-ui` is an import subpath. Runtime remains the persisted source of truth.

## Service

`AGUI.layer({ address })` requires the host's Runtime layer. `AGUI.run(input)` returns the AG-UI event stream for the admitted or resumed run.

## Input boundary

The adapter accepts only the final user message, preserves runId, maps threadId to the Runtime session, rejects client tools and authority-bearing roles, and resumes only the exact open Runtime wait.

See [generalist/runtime](/reference/runtime).
