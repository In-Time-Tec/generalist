[**generalist**](../../index)

***

[generalist](../../index) / [repl.bun](../index) / BunKernelSnapshotStore

# BunKernelSnapshotStore

## Interfaces

<a id="options"></a>

### Options

Where one Session's best-effort namespace snapshot is written.

#### Properties

<a id="dataroot"></a>

##### dataRoot

> `readonly` **dataRoot**: `string`

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`KernelSnapshotStore`](../../repl/namespaces/KernelSnapshotStore#kernelsnapshotstore), `never`, `FileSystem.FileSystem` \| `Path.Path`\>

One durable filesystem-backed kernel snapshot store.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`KernelSnapshotStore`](../../repl/namespaces/KernelSnapshotStore#kernelsnapshotstore), `never`, `FileSystem.FileSystem` \| `Path.Path`\>

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => `Effect.Effect`\<[`Service`](../../repl/namespaces/KernelSnapshotStore#service), `never`, `FileSystem.FileSystem` \| `Path.Path`\>

Best-effort namespace persistence on the Effect filesystem. Snapshots are
owner-only, written through a same-directory temporary file plus rename so a reader never
observes a partial capture, and a corrupt manifest fails typed instead of being restored.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Service`](../../repl/namespaces/KernelSnapshotStore#service), `never`, `FileSystem.FileSystem` \| `Path.Path`\>
