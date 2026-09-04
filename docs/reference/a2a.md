---
title: "generalist/unstable/a2a"
description: "A2A v1 server projection over the authoritative Runtime lifecycle."
---

generalist/unstable/a2a maps A2A v1 tasks onto Runtime runs without storing a second lifecycle.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist @a2a-js/sdk@1.0.1
```

`generalist/unstable/a2a` is an import subpath. A2A task IDs are caller-selected Runtime Run IDs.

## Service

`A2A.layer({ address, card })` requires the host's Runtime layer and exposes a v1 DefaultRequestHandler. Task snapshots, history, waits, cancellation, and terminal outcomes remain Runtime projections.

## Remote input

Only user text/plain text parts and application/json data parts are admitted. Files, URLs, authority-bearing roles, and mismatched media are rejected before Runtime admission.

See [generalist/runtime](/reference/runtime).
