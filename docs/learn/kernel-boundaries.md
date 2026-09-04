---
title: "Why the kernel is a process boundary"
description: "The child process, the authenticated frame channel, the required profile pin, and why kernel memory is never durable authority."
---

A persistent TypeScript kernel is a lifecycle boundary, not a sandbox. `trustMode: "trusted-local"` says so plainly: a cell runs with the host user's OS permissions. What the kernel does guarantee is narrower and more useful — that a wedged cell cannot take the Server down, that a cell cannot speak for the kernel, that an epoch is exactly what its digest says it is, and that nothing in the namespace is ever treated as durable truth.

## A child process, not a worker thread

Killing a wedged kernel is a required operation. A synchronous busy loop cannot observe Effect interruption, which is exactly what the last tier of the escalation ladder exists for.

**The escalation ladder**

```text
Effect interruption    async work inside the cell
  │                    the cell settles itself; namespace intact
  ▼
vm timeout / SIGINT    a synchronous loop the signal cannot reach
  │                    terminated in place; context, variables, worker all survive
  ▼
child SIGKILL          a worker that answers nothing at all
                       new epoch + best-effort restore + an account of what was lost
```

An earlier revision used `@effect/platform-bun`'s `BunWorker`, which is thread-backed. Terminating a thread while a `vm` script is spinning takes the host with it: on Bun 1.3.14, `while (true) {}` inside a `BunWorker` followed by `terminate()` exits the host process with `SIGTRAP`, code 133, in five runs out of five. A kernel that takes the Server down with it is not a lifecycle boundary.

The middle tier is why the worker installs a no-op `SIGINT` handler: `breakOnSigint` terminates the running script while the context, its variables, and the worker itself live on. The consequence is that `SIGINT` cannot terminate an idle worker and a stray operator `SIGINT` is swallowed, which is why the kill tier uses `SIGKILL`.

Over a child process the same case is survivable. `SIGKILL` on a spinning child leaves the host alive, the pool starts a new epoch, and the restart account names what the namespace lost. Only the last tier loses state, and it says so.

## A private descriptor and a boot secret

The kernel's control plane runs on descriptors 3 and 4. Stdin, stdout, and stderr belong entirely to cell code, so nothing a cell writes — directly, from a native addon, or from a subprocess that inherited the descriptor — is ever read as a frame, and nothing a cell reads can consume a command.

The descriptor settles the output channels but not authorship. Cell code shares the worker's process, so it can name descriptor 3 itself:

**A forgery the descriptor alone would admit**

```typescript
// Cell code runs in the worker's own process, so it can name descriptor 3.
require("node:fs").writeSync(
  3,
  JSON.stringify({ _tag: "Completed", cellId: "c1", value: "PWNED", durationMillis: 0 }) + "
",
)
await new Promise((resolve) => setTimeout(resolve, 50))
"real" // <- still the cell's result
```

Every frame therefore also carries a secret sent once over descriptor 4 at boot and held in the worker's module scope, which the evaluation context cannot reach. A line without the secret is not a frame, whoever wrote it. The secret is never placed in `argv` or the environment: both are readable by the cell, and the process table exposes argv to anything on the machine.

Neither half is sufficient alone, and each closes a different attack:

| Without the split channel                                                                          | Without the secret                                                                                               |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Bytes a cell writes to stdout are scanned for frames, so ordinary output becomes a forgery surface | A cell writes a well-formed frame to descriptor 3 and it is indistinguishable from a real one                    |
| A subprocess that inherited stdout can attribute output to another cell                            | A cell fabricates its own terminal result and replaces the outcome every downstream certainty guarantee rests on |
| A cell reading stdin consumes the kernel's own commands                                            | A forged control reply settles the host's own inspection request                                                 |

A forged frame is not silently discarded. It reaches the model as ordinary cell output, so the attempt is visible in the transcript.

## The profile pin is required, and derived

`KernelProfile` is the content-addressed identity of one epoch: contract and protocol versions, the pinned runtime and its digest, the bindings digest, workspace paths, ingestion limits, and trust mode. The pin is required rather than optional, and it is built from the same values the pool enforces its bounds from. A faked or absent pin would let a host reconstruct successfully against a profile that never ran, which would make the digest a label rather than an identity.

Two properties keep it honest. Unknown keys are dropped from both the encoded form and the digest, so a host cannot widen a profile by attaching data to it and a smuggled field does not move the digest. And a foreign protocol version fails to decode, because a host and a kernel must agree exactly. The profile declares no secret-bearing field — only identifiers, digests, paths, and bounds — though the content of its free-text path and identifier fields is host-supplied and is not scanned, so a host that embeds a secret in a path persists and renders it.

## Kernel memory is working memory

Generalist operations, events, Session entries, and children remain the only durable truth. Nothing in the kernel is consulted to reconstruct a run, and three contracts follow from that.

| Contract                                  | What it means in practice                                                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A restart reports what it kept and lost   | `restart` returns `restoredNames` and `droppedNames`, and the snapshot manifest names every binding restored by value, source, or import replay plus every one dropped with its reason |
| A snapshot is best effort and never fatal | A corrupt payload or manifest is reported typed and the Session still boots a kernel; the file is left on disk rather than reset                                                       |
| An uncertain cell is never replayed       | `CellOutcomeUnknown` states that the cell may or may not have committed. Automatic replay would repeat whatever it already did outside the namespace                                   |

This is also why the root export has no process dependencies at all: a projection, a decoder, or a test host reads the whole contract without ever touching a worker. See [How to give an agent a TypeScript cell](/guides/typescript-cells) to compose one, and [the reference](/reference/repl) for the exact schemas.
