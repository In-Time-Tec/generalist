[**generalist**](../index)

***

[generalist](../index) / repl.bun

# repl.bun

## Namespaces

- [BunKernelPool](./namespaces/BunKernelPool)
- [BunKernelSnapshotStore](./namespaces/BunKernelSnapshotStore)

## Variables

<a id="workermodule"></a>

### workerModule

> `const` **workerModule**: `string`

Filesystem path of the kernel worker module a pool spawns. A host passes this as
`workerModule` when composing a pool; the worker is not an importable entrypoint, so this is the
only supported way to locate it.

***

<a id="workersupportmodules"></a>

### workerSupportModules

> `const` **workerSupportModules**: `ReadonlyArray`\<`string`\>

Modules a host relocating `workerModule` must copy beside it by basename.
