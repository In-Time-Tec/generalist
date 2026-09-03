[**generalist**](../../index)

***

[generalist](../../index) / [repl.bun](../index) / BunKernelPool

# BunKernelPool

## Interfaces

<a id="options"></a>

### Options

How the pool boots and retires the one kernel that owns each Session.

#### Properties

<a id="bootstrap"></a>

##### bootstrap?

> `readonly` `optional` **bootstrap?**: `string`

Host source evaluated on every worker start, after restore, before any cell.

<a id="capturetimeoutmillis"></a>

##### captureTimeoutMillis?

> `readonly` `optional` **captureTimeoutMillis?**: `number`

<a id="environment"></a>

##### environment

> `readonly` **environment**: `Readonly`\<`Record`\<`string`, `string`\>\>

<a id="idletimetolive"></a>

##### idleTimeToLive

> `readonly` **idleTimeToLive**: `Input`

<a id="interruptgracemillis"></a>

##### interruptGraceMillis

> `readonly` **interruptGraceMillis**: `number`

<a id="maxconcurrentboots"></a>

##### maxConcurrentBoots

> `readonly` **maxConcurrentBoots**: `number`

<a id="profile"></a>

##### profile

> `readonly` **profile**: `object`

###### bindingsDigest

> `readonly` **bindingsDigest**: `string`

###### checkpoints

> `readonly` **checkpoints**: `object`

###### checkpoints.filesystem

> `readonly` **filesystem**: `boolean`

###### checkpoints.liveProcess

> `readonly` **liveProcess**: `boolean`

###### checkpoints.namespace

> `readonly` **namespace**: `boolean`

###### contractVersion

> `readonly` **contractVersion**: `2`

###### image

> `readonly` **image**: `object`

###### image.digest

> `readonly` **digest**: `string`

###### image.kind

> `readonly` **kind**: `"image"` \| `"runtime"` \| `"template"`

###### image.reference

> `readonly` **reference**: `string`

###### isolation

> `readonly` **isolation**: `"container"` \| `"microvm"` \| `"host-process"`

###### limits

> `readonly` **limits**: `object`

###### limits.cellDeadlineMillis

> `readonly` **cellDeadlineMillis**: `number`

###### limits.sourceBytes

> `readonly` **sourceBytes**: `number`

###### protocolVersion

> `readonly` **protocolVersion**: `1`

###### provider

> `readonly` **provider**: `string`

###### runtime

> `readonly` **runtime**: `object`

###### runtime.digest

> `readonly` **digest**: `string`

###### runtime.name

> `readonly` **name**: `string`

###### runtime.version

> `readonly` **version**: `string`

###### workspace

> `readonly` **workspace**: `object`

###### workspace.dataRoot

> `readonly` **dataRoot**: `string`

###### workspace.root

> `readonly` **root**: `string`

<a id="runtimecommand"></a>

##### runtimeCommand

> `readonly` **runtimeCommand**: `string`

<a id="starttimeoutmillis"></a>

##### startTimeoutMillis

> `readonly` **startTimeoutMillis**: `number`

<a id="workermodule"></a>

##### workerModule

> `readonly` **workerModule**: `string`

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`KernelPool`](../../repl/namespaces/KernelPool#kernelpool), `never`, [`KernelSnapshotStore`](../../repl/namespaces/KernelSnapshotStore#kernelsnapshotstore)\>

One Server-scoped pool of live Bun kernels, one per Session.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`KernelPool`](../../repl/namespaces/KernelPool#kernelpool), `never`, [`KernelSnapshotStore`](../../repl/namespaces/KernelSnapshotStore#kernelsnapshotstore)\>

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => `Effect.Effect`\<[`Service`](../../repl/namespaces/KernelPool#service), `never`, [`KernelSnapshotStore`](../../repl/namespaces/KernelSnapshotStore#kernelsnapshotstore) \| `Scope.Scope`\>

One live Bun kernel per Session, owned by a Server-scoped reference-counted map.
A Session reuses its kernel across Runs, and the map's own scope releases every kernel on Server
shutdown. The pool adds no poll, no keepalive, and no timer that survives a completed cell: a
kernel's reference is held for exactly the duration of a cell, and idle eviction is the map's
reference-count expiry rather than a sweep.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Service`](../../repl/namespaces/KernelPool#service), `never`, [`KernelSnapshotStore`](../../repl/namespaces/KernelSnapshotStore#kernelsnapshotstore) \| `Scope.Scope`\>
