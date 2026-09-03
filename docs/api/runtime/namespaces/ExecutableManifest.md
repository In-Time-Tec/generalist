[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ExecutableManifest

# ExecutableManifest

## Type Aliases

<a id="executablemanifest"></a>

### ExecutableManifest

> **ExecutableManifest** = [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

Complete closed executable profile registry and entry closure.

***

<a id="executableref"></a>

### ExecutableRef

> **ExecutableRef** = [`ExecutableRef`](../../generalist/namespaces/ExecutableManifest#executableref)

Durable reference to one exact executable closure and active Agent.

***

<a id="pinnedexecutable"></a>

### PinnedExecutable

> **PinnedExecutable** = [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

Executable closure paired with its constructor-owned reference.

***

<a id="profilebinding"></a>

### ProfileBinding

> **ProfileBinding** = [`ProfileBinding`](../../generalist/namespaces/ExecutableManifest#profilebinding)

One globally pinned child profile available by selection name.

## Variables

<a id="decode"></a>

### decode

> `const` **decode**: *typeof* [`decode`](../../generalist/namespaces/ExecutableManifest#decode)

***

<a id="encode"></a>

### encode

> `const` **encode**: *typeof* [`encode`](../../generalist/namespaces/ExecutableManifest#encode)

***

<a id="executablemanifest-1"></a>

### ExecutableManifest

> **ExecutableManifest**: `Codec`\<[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest), [`ExecutableManifestEncoded`](../../generalist/namespaces/ExecutableManifest#executablemanifestencoded), `never`, `never`\>

Complete closed executable Agent graph.

***

<a id="executableref-1"></a>

### ExecutableRef

> `const` **ExecutableRef**: *typeof* [`ExecutableRef`](../../generalist/namespaces/ExecutableManifest#executableref-1)

Durable reference to one exact executable closure and active Agent.

***

<a id="make"></a>

### make

> `const` **make**: *typeof* [`make`](../../generalist/namespaces/ExecutableManifest#make)

Construct, validate, canonicalize, and pin a complete executable closure.

***

<a id="maketest"></a>

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

<a id="pinnedexecutable-1"></a>

### PinnedExecutable

> **PinnedExecutable**: `Codec`\<[`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable), `PinnedExecutableEncoded`, `never`, `never`\>

Paired executable authority boundary.
