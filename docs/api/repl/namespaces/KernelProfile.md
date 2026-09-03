[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / KernelProfile

# KernelProfile

## Interfaces

<a id="makeoptions"></a>

### MakeOptions

#### Properties

<a id="bindingsdigest"></a>

##### bindingsDigest

> `readonly` **bindingsDigest**: `string`

<a id="checkpoints"></a>

##### checkpoints

> `readonly` **checkpoints**: `object`

###### filesystem

> `readonly` **filesystem**: `boolean`

###### liveProcess

> `readonly` **liveProcess**: `boolean`

###### namespace

> `readonly` **namespace**: `boolean`

<a id="image"></a>

##### image

> `readonly` **image**: `object`

###### digest

> `readonly` **digest**: `string`

###### kind

> `readonly` **kind**: `"image"` \| `"runtime"` \| `"template"`

###### reference

> `readonly` **reference**: `string`

<a id="isolation"></a>

##### isolation

> `readonly` **isolation**: `"container"` \| `"microvm"` \| `"host-process"`

<a id="limits"></a>

##### limits

> `readonly` **limits**: `object`

###### cellDeadlineMillis

> `readonly` **cellDeadlineMillis**: `number`

###### sourceBytes

> `readonly` **sourceBytes**: `number`

<a id="provider"></a>

##### provider

> `readonly` **provider**: `string`

<a id="runtime"></a>

##### runtime

> `readonly` **runtime**: `object`

###### digest

> `readonly` **digest**: `string`

###### name

> `readonly` **name**: `string`

###### version

> `readonly` **version**: `string`

<a id="workspace"></a>

##### workspace

> `readonly` **workspace**: `object`

###### dataRoot

> `readonly` **dataRoot**: `string`

###### root

> `readonly` **root**: `string`

## Type Aliases

<a id="checkpointcapabilities"></a>

### CheckpointCapabilities

> **CheckpointCapabilities** = *typeof* `CheckpointCapabilities.Type`

Distinct state a provider can restore after its live kernel stops or pauses.

***

<a id="checkpointkind"></a>

### CheckpointKind

> **CheckpointKind** = *typeof* `CheckpointKind.Type`

What actually continued when a kernel resource was recovered.

***

<a id="image-1"></a>

### Image

> **Image** = *typeof* `Image.Type`

Immutable runtime, image, or template reconstructed for one kernel epoch.

***

<a id="isolation-1"></a>

### Isolation

> **Isolation** = *typeof* `Isolation.Type`

Physical process boundary supplied to a kernel. This is a fact, not a security rating.

***

<a id="kernelprofile"></a>

### KernelProfile

> **KernelProfile** = *typeof* `KernelProfile.Type`

Everything a kernel epoch is reconstructed from. The profile declares no
secret-bearing field: every field is an identifier, a digest, a path, or a bound, and there is no
credential, token, header, or environment slot. Unknown keys are dropped from both the encoded
form and the digest, so a host cannot widen the profile by attaching extra data to it. The
content of the free-text identifier and path fields is host-supplied and is not scanned or
redacted; a host that embeds a secret in a path or a runtime name persists and renders it.

***

<a id="limits-1"></a>

### Limits

> **Limits** = *typeof* `Limits.Type`

Source and execution bounds enforced by the kernel.

***

<a id="runtime-1"></a>

### Runtime

> **Runtime** = *typeof* `Runtime.Type`

The pinned runtime that evaluates cells.

***

<a id="workspace-1"></a>

### Workspace

> **Workspace** = *typeof* `Workspace.Type`

Where cells resolve imports, `require`, and relative paths.

## Variables

<a id="bindingsdigest-1"></a>

### bindingsDigest

> `const` **bindingsDigest**: (`names`) => `string`

Digest of the ordered set of host binding module names mounted into a kernel.

#### Parameters

##### names

`ReadonlyArray`\<`string`\>

#### Returns

`string`

***

<a id="checkpointcapabilities-1"></a>

### CheckpointCapabilities

> `const` **CheckpointCapabilities**: `Schema.Struct`\<\{ `filesystem`: `Schema.Boolean`; `liveProcess`: `Schema.Boolean`; `namespace`: `Schema.Boolean`; \}\>

Distinct state a provider can restore after its live kernel stops or pauses.

***

<a id="checkpointkind-1"></a>

### CheckpointKind

> `const` **CheckpointKind**: `Schema.Literals`\<readonly \[`"live-process"`, `"filesystem"`, `"namespace"`, `"restart-only"`\]\>

What actually continued when a kernel resource was recovered.

***

<a id="contractversion"></a>

### contractVersion

> `const` **contractVersion**: `2` = `2`

Version of the KernelProfile contract itself.

***

<a id="digest"></a>

### digest

> `const` **digest**: (`profile`) => `string`

Content-addressed identity of one profile. Two profiles with the same digest
reconstruct the same kernel epoch; a different digest requires a new epoch.

#### Parameters

##### profile

[`KernelProfile`](#kernelprofile)

#### Returns

`string`

***

<a id="image-2"></a>

### Image

> `const` **Image**: `Schema.Struct`\<\{ `digest`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"runtime"`, `"image"`, `"template"`\]\>; `reference`: `Schema.String`; \}\>

Immutable runtime, image, or template reconstructed for one kernel epoch.

***

<a id="isolation-2"></a>

### Isolation

> `const` **Isolation**: `Schema.Literals`\<readonly \[`"host-process"`, `"container"`, `"microvm"`\]\>

Physical process boundary supplied to a kernel. This is a fact, not a security rating.

***

<a id="kernelprofile-1"></a>

### KernelProfile

> `const` **KernelProfile**: `Schema.Struct`\<\{ `bindingsDigest`: `Schema.String`; `checkpoints`: `Schema.Struct`\<\{ `filesystem`: `Schema.Boolean`; `liveProcess`: `Schema.Boolean`; `namespace`: `Schema.Boolean`; \}\>; `contractVersion`: `Schema.Literal`\<`2`\>; `image`: `Schema.Struct`\<\{ `digest`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"runtime"`, `"image"`, `"template"`\]\>; `reference`: `Schema.String`; \}\>; `isolation`: `Schema.Literals`\<readonly \[`"host-process"`, `"container"`, `"microvm"`\]\>; `limits`: `Schema.Struct`\<\{ `cellDeadlineMillis`: `Schema.Int`; `sourceBytes`: `Schema.Int`; \}\>; `protocolVersion`: `Schema.Literal`\<`1`\>; `provider`: `Schema.String`; `runtime`: `Schema.Struct`\<\{ `digest`: `Schema.String`; `name`: `Schema.String`; `version`: `Schema.String`; \}\>; `workspace`: `Schema.Struct`\<\{ `dataRoot`: `Schema.String`; `root`: `Schema.String`; \}\>; \}\>

Everything a kernel epoch is reconstructed from. The profile declares no
secret-bearing field: every field is an identifier, a digest, a path, or a bound, and there is no
credential, token, header, or environment slot. Unknown keys are dropped from both the encoded
form and the digest, so a host cannot widen the profile by attaching extra data to it. The
content of the free-text identifier and path fields is host-supplied and is not scanned or
redacted; a host that embeds a secret in a path or a runtime name persists and renders it.

***

<a id="limits-2"></a>

### Limits

> `const` **Limits**: `Schema.Struct`\<\{ `cellDeadlineMillis`: `Schema.Int`; `sourceBytes`: `Schema.Int`; \}\>

Source and execution bounds enforced by the kernel.

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => [`KernelProfile`](#kernelprofile)

Construct one profile at the current contract and protocol version.

#### Parameters

##### options

[`MakeOptions`](#makeoptions)

#### Returns

[`KernelProfile`](#kernelprofile)

***

<a id="protocolversion"></a>

### protocolVersion

> `const` **protocolVersion**: `1` = `1`

Wire version of the cell protocol. A kernel and a host must agree exactly.

***

<a id="runtime-2"></a>

### Runtime

> `const` **Runtime**: `Schema.Struct`\<\{ `digest`: `Schema.String`; `name`: `Schema.String`; `version`: `Schema.String`; \}\>

The pinned runtime that evaluates cells.

***

<a id="workspace-2"></a>

### Workspace

> `const` **Workspace**: `Schema.Struct`\<\{ `dataRoot`: `Schema.String`; `root`: `Schema.String`; \}\>

Where cells resolve imports, `require`, and relative paths.
