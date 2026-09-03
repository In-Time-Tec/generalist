[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ExecutableManifest

# ExecutableManifest

## Type Aliases

### ExecutableManifest

> **ExecutableManifest** = [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

Complete closed executable profile registry and entry closure.

***

### ExecutableRef

> **ExecutableRef** = [`ExecutableRef`](../../generalist/namespaces/ExecutableManifest#executableref)

Durable reference to one exact executable closure and active Agent.

***

### PinnedExecutable

> **PinnedExecutable** = [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

Executable closure paired with its constructor-owned reference.

***

### ProfileBinding

> **ProfileBinding** = [`ProfileBinding`](../../generalist/namespaces/ExecutableManifest#profilebinding)

One globally pinned child profile available by selection name.

## Variables

### decode

> `const` **decode**: *typeof* [`decode`](../../generalist/namespaces/ExecutableManifest#decode)

***

### encode

> `const` **encode**: *typeof* [`encode`](../../generalist/namespaces/ExecutableManifest#encode)

***

### ExecutableManifest

> **ExecutableManifest**: `Codec`\<[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest), [`ExecutableManifestEncoded`](../../generalist/namespaces/ExecutableManifest#executablemanifestencoded), `never`, `never`\>

Complete closed executable Agent graph.

***

### ExecutableRef

> `const` **ExecutableRef**: *typeof* [`ExecutableRef`](../../generalist/namespaces/ExecutableManifest#executableref-1)

Durable reference to one exact executable closure and active Agent.

***

### make

> `const` **make**: *typeof* [`make`](../../generalist/namespaces/ExecutableManifest#make)

Construct, validate, canonicalize, and pin a complete executable closure.

***

### makeTest

> `const` **makeTest**: \{(`revision?`): (`name`) => [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable); (`name`, `revision?`): [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable); \}

Construct an exact static executable fixture.

#### Call Signature

> (`revision?`): (`name`) => [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

##### Parameters

###### revision?

`string`

##### Returns

(`name`) => [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

#### Call Signature

> (`name`, `revision?`): [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

##### Parameters

###### name

`string`

###### revision?

`string`

##### Returns

[`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

***

### PinnedExecutable

> **PinnedExecutable**: `Codec`\<[`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable), `PinnedExecutableEncoded`, `never`, `never`\>

Paired executable authority boundary.
