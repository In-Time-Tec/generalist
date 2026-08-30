# Kernel memory is working memory; the run log is the authority

A cell's namespace is not durable state. TenetKit operations, events, Session entries, and children remain the only truth, and nothing in `tenetkit/repl` is consulted to reconstruct a run.

Three consequences follow, and each is a contract rather than a convention.

**A restart reports exactly what it kept and what it lost.** `KernelPool.restart` returns `restoredNames` and `droppedNames`, and `KernelSnapshotStore.Manifest` names every binding restored by value, by source, or by import replay, plus every binding dropped with its `DropReason`. `bun-snapshot.test.ts` asserts that a plain value is restored, a function is restored by re-evaluating its source, and a module binding is named as dropped rather than silently missing.

**A snapshot is best effort and never fatal.** A corrupt payload or a corrupt manifest is reported and the Session still boots a kernel; `BunKernelSnapshotStore.load` fails typed with `reason: "corrupt"` and leaves the file on disk rather than resetting it.

**An uncertain cell is never replayed.** When a kernel dies mid-cell the outcome is `CellOutcomeUnknown`, which states that the cell may or may not have committed its effects. A host resolves it explicitly. Automatic replay would repeat whatever the cell already did outside the namespace, which is precisely what the durable journal exists to prevent.

This is why the pool holds no authority beyond the current epoch, and why `tenetkit/repl`'s root export has no process dependencies at all: a projection, a decoder, or a test host reads the contract without ever touching a worker.
