[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / KernelProfile

# KernelProfile

## Interfaces

### MakeOptions

#### Properties

##### bindingsDigest

> `readonly` **bindingsDigest**: `string`

##### checkpoints

> `readonly` **checkpoints**: `object`

###### filesystem

> `readonly` **filesystem**: `boolean`

###### liveProcess

> `readonly` **liveProcess**: `boolean`

###### namespace

> `readonly` **namespace**: `boolean`

##### image

> `readonly` **image**: `object`

###### digest

> `readonly` **digest**: `string`

###### kind

> `readonly` **kind**: `"image"` \| `"runtime"` \| `"template"`

###### reference

> `readonly` **reference**: `string`

##### isolation

> `readonly` **isolation**: `"container"` \| `"microvm"` \| `"host-process"`

##### limits

> `readonly` **limits**: `object`

###### cellDeadlineMillis

> `readonly` **cellDeadlineMillis**: `number`

###### sourceBytes

> `readonly` **sourceBytes**: `number`

##### provider

> `readonly` **provider**: `string`

##### runtime

> `readonly` **runtime**: `object`

###### digest

> `readonly` **digest**: `string`

###### name

> `readonly` **name**: `string`

###### version

> `readonly` **version**: `string`

##### workspace

> `readonly` **workspace**: `object`

###### dataRoot

> `readonly` **dataRoot**: `string`

###### root

> `readonly` **root**: `string`

## Type Aliases

### CheckpointCapabilities

> **CheckpointCapabilities** = *typeof* `CheckpointCapabilities.Type`

Distinct state a provider can restore after its live kernel stops or pauses.

***

### CheckpointKind

> **CheckpointKind** = *typeof* `CheckpointKind.Type`

What actually continued when a kernel resource was recovered.

***

### Image

> **Image** = *typeof* `Image.Type`

Immutable runtime, image, or template reconstructed for one kernel epoch.

***

### Isolation

> **Isolation** = *typeof* `Isolation.Type`

Physical process boundary supplied to a kernel. This is a fact, not a security rating.

***

### KernelProfile

> **KernelProfile** = *typeof* `KernelProfile.Type`

Everything a kernel epoch is reconstructed from. The profile declares no
secret-bearing field: every field is an identifier, a digest, a path, or a bound, and there is no
credential, token, header, or environment slot. Unknown keys are dropped from both the encoded
form and the digest, so a host cannot widen the profile by attaching extra data to it. The
content of the free-text identifier and path fields is host-supplied and is not scanned or
redacted; a host that embeds a secret in a path or a runtime name persists and renders it.

***

### Limits

> **Limits** = *typeof* `Limits.Type`

Source and execution bounds enforced by the kernel.

***

### Runtime

> **Runtime** = *typeof* `Runtime.Type`

The pinned runtime that evaluates cells.

***

### Workspace

> **Workspace** = *typeof* `Workspace.Type`

Where cells resolve imports, `require`, and relative paths.

## Variables

### bindingsDigest

> `const` **bindingsDigest**: (`names`) => `string`

Digest of the ordered set of host binding module names mounted into a kernel.

#### Parameters

##### names

`ReadonlyArray`\<`string`\>

#### Returns

`string`

***

### CheckpointCapabilities

> `const` **CheckpointCapabilities**: `Schema.Struct`\<\{ `filesystem`: `Schema.Boolean`; `liveProcess`: `Schema.Boolean`; `namespace`: `Schema.Boolean`; \}\>

Distinct state a provider can restore after its live kernel stops or pauses.

***

### CheckpointKind

> `const` **CheckpointKind**: `Schema.Literals`\<readonly \[`"live-process"`, `"filesystem"`, `"namespace"`, `"restart-only"`\]\>

What actually continued when a kernel resource was recovered.

***

### contractVersion

> `const` **contractVersion**: `2` = `2`

Version of the KernelProfile contract itself.

***

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

### Image

> `const` **Image**: `Schema.Struct`\<\{ `digest`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"runtime"`, `"image"`, `"template"`\]\>; `reference`: `Schema.String`; \}\>

Immutable runtime, image, or template reconstructed for one kernel epoch.

***

### Isolation

> `const` **Isolation**: `Schema.Literals`\<readonly \[`"host-process"`, `"container"`, `"microvm"`\]\>

Physical process boundary supplied to a kernel. This is a fact, not a security rating.

***

### KernelProfile

> `const` **KernelProfile**: `Schema.Struct`\<\{ `bindingsDigest`: `Schema.String`; `checkpoints`: `Schema.Struct`\<\{ `filesystem`: `Schema.Boolean`; `liveProcess`: `Schema.Boolean`; `namespace`: `Schema.Boolean`; \}\>; `contractVersion`: `Schema.Literal`\<`2`\>; `image`: `Schema.Struct`\<\{ `digest`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"runtime"`, `"image"`, `"template"`\]\>; `reference`: `Schema.String`; \}\>; `isolation`: `Schema.Literals`\<readonly \[`"host-process"`, `"container"`, `"microvm"`\]\>; `limits`: `Schema.Struct`\<\{ `cellDeadlineMillis`: `Schema.Int`; `sourceBytes`: `Schema.Int`; \}\>; `protocolVersion`: `Schema.Literal`\<`1`\>; `provider`: `Schema.String`; `runtime`: `Schema.Struct`\<\{ `digest`: `Schema.String`; `name`: `Schema.String`; `version`: `Schema.String`; \}\>; `workspace`: `Schema.Struct`\<\{ `dataRoot`: `Schema.String`; `root`: `Schema.String`; \}\>; \}\>

Everything a kernel epoch is reconstructed from. The profile declares no
secret-bearing field: every field is an identifier, a digest, a path, or a bound, and there is no
credential, token, header, or environment slot. Unknown keys are dropped from both the encoded
form and the digest, so a host cannot widen the profile by attaching extra data to it. The
content of the free-text identifier and path fields is host-supplied and is not scanned or
redacted; a host that embeds a secret in a path or a runtime name persists and renders it.

***

### Limits

> `const` **Limits**: `Schema.Struct`\<\{ `cellDeadlineMillis`: `Schema.Int`; `sourceBytes`: `Schema.Int`; \}\>

Source and execution bounds enforced by the kernel.

***

### make

> `const` **make**: (`options`) => [`KernelProfile`](#kernelprofile)

Construct one profile at the current contract and protocol version.

#### Parameters

##### options

[`MakeOptions`](#makeoptions)

#### Returns

[`KernelProfile`](#kernelprofile)

***

### protocolVersion

> `const` **protocolVersion**: `1` = `1`

Wire version of the cell protocol. A kernel and a host must agree exactly.

***

### Runtime

> `const` **Runtime**: `Schema.Struct`\<\{ `digest`: `Schema.String`; `name`: `Schema.String`; `version`: `Schema.String`; \}\>

The pinned runtime that evaluates cells.

***

### Workspace

> `const` **Workspace**: `Schema.Struct`\<\{ `dataRoot`: `Schema.String`; `root`: `Schema.String`; \}\>

Where cells resolve imports, `require`, and relative paths.
