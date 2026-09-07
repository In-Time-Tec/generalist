[**generalist**](./index.md)

***

[generalist](./index.md) / blob-store

# blob-store

## Classes

<a id="blobnotfound"></a>

### BlobNotFound

**`Experimental`**

No content exists for the requested SHA-256 digest.

#### Extends

- `BlobNotFound_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new BlobNotFound**(...`args`): [`BlobNotFound`](#blobnotfound)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`BlobNotFound`](#blobnotfound)

###### Inherited from

`BlobNotFound_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`BlobNotFound_base.hint`

<a id="sha256"></a>

##### sha256

> `readonly` **sha256**: `string`

**`Experimental`**

###### Inherited from

`BlobNotFound_base.sha256`

***

<a id="blobstore"></a>

### BlobStore

**`Experimental`**

Content-addressed BlobStore service.

#### Extends

- `BlobStore_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new BlobStore**(`_`): [`BlobStore`](#blobstore)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`BlobStore`](#blobstore)

###### Inherited from

`BlobStore_base.constructor`

***

<a id="blobstoreerror"></a>

### BlobStoreError

**`Experimental`**

Object access, encoding, or content integrity failed.

#### Extends

- `BlobStoreError_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new BlobStoreError**(...`args`): [`BlobStoreError`](#blobstoreerror)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`BlobStoreError`](#blobstoreerror)

###### Inherited from

`BlobStoreError_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`BlobStoreError_base.hint`

<a id="operation"></a>

##### operation

> `readonly` **operation**: `string`

**`Experimental`**

###### Inherited from

`BlobStoreError_base.operation`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `string`

**`Experimental`**

###### Inherited from

`BlobStoreError_base.reason`

***

<a id="blobtoolarge"></a>

### BlobTooLarge

**`Experimental`**

Content exceeds the configured byte limit.

#### Extends

- `BlobTooLarge_base`

#### Constructors

<a id="constructor-3"></a>

##### Constructor

> **new BlobTooLarge**(...`args`): [`BlobTooLarge`](#blobtoolarge)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`BlobTooLarge`](#blobtoolarge)

###### Inherited from

`BlobTooLarge_base.constructor`

#### Properties

<a id="bytes"></a>

##### bytes

> `readonly` **bytes**: `number`

**`Experimental`**

###### Inherited from

`BlobTooLarge_base.bytes`

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`BlobTooLarge_base.hint`

<a id="maxbytes"></a>

##### maxBytes

> `readonly` **maxBytes**: `number`

**`Experimental`**

###### Inherited from

`BlobTooLarge_base.maxBytes`

## Interfaces

<a id="layeroptions"></a>

### LayerOptions

**`Experimental`**

Explicit journal-compatible tenant namespace and maximum payload size for uploads and reads.

#### Properties

<a id="environment"></a>

##### environment

> `readonly` **environment**: `string`

**`Experimental`**

<a id="maxbytes-1"></a>

##### maxBytes?

> `readonly` `optional` **maxBytes?**: `number`

**`Experimental`**

<a id="tenant"></a>

##### tenant

> `readonly` **tenant**: `string`

**`Experimental`**

***

<a id="resolvedblob"></a>

### ResolvedBlob

**`Experimental`**

Provider-ready content and its canonical stored reference.

#### Properties

<a id="data"></a>

##### data

> `readonly` **data**: `Uint8Array`\<`ArrayBufferLike`\> \| `URL`

**`Experimental`**

<a id="ref"></a>

##### ref

> `readonly` **ref**: `object`

**`Experimental`**

###### bytes

> `readonly` **bytes**: `number`

###### filename?

> `readonly` `optional` **filename?**: `string`

###### mediaType

> `readonly` **mediaType**: `string`

###### sha256

> `readonly` **sha256**: `string`

***

<a id="resolveoptions"></a>

### ResolveOptions

**`Experimental`**

Provider transport preference for resolving a reference.

#### Properties

<a id="prefer"></a>

##### prefer

> `readonly` **prefer**: `"bytes"` \| `"url"`

**`Experimental`**

***

<a id="service"></a>

### Service

**`Experimental`**

Content-addressed storage operations.

#### Properties

<a id="get"></a>

##### get

> `readonly` **get**: (`sha256`) => `Effect`\<\{ `data`: `Uint8Array`; `ref`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; \}, [`BlobNotFound`](#blobnotfound) \| [`BlobStoreError`](#blobstoreerror)\>

**`Experimental`**

###### Parameters

###### sha256

`string`

###### Returns

`Effect`\<\{ `data`: `Uint8Array`; `ref`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; \}, [`BlobNotFound`](#blobnotfound) \| [`BlobStoreError`](#blobstoreerror)\>

<a id="put"></a>

##### put

> `readonly` **put**: (`input`) => `Effect`\<\{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}, [`BlobTooLarge`](#blobtoolarge) \| [`BlobStoreError`](#blobstoreerror)\>

**`Experimental`**

###### Parameters

###### input

###### data

`Uint8Array`

###### filename?

`string`

###### mediaType

`string`

###### Returns

`Effect`\<\{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}, [`BlobTooLarge`](#blobtoolarge) \| [`BlobStoreError`](#blobstoreerror)\>

<a id="resolve"></a>

##### resolve

> `readonly` **resolve**: (`ref`, `options`) => `Effect`\<[`ResolvedBlob`](#resolvedblob), [`BlobNotFound`](#blobnotfound) \| [`BlobStoreError`](#blobstoreerror)\>

**`Experimental`**

###### Parameters

###### ref

###### bytes

`number`

###### filename?

`string`

###### mediaType

`string`

###### sha256

`string`

###### options

[`ResolveOptions`](#resolveoptions)

###### Returns

`Effect`\<[`ResolvedBlob`](#resolvedblob), [`BlobNotFound`](#blobnotfound) \| [`BlobStoreError`](#blobstoreerror)\>

## Type Aliases

<a id="blob"></a>

### Blob

> **Blob** = *typeof* `Blob.Type`

**`Experimental`**

Stored content and its canonical reference.

***

<a id="put-1"></a>

### Put

> **Put** = *typeof* `Put.Type`

**`Experimental`**

Input accepted by `BlobStore.put`.

## Variables

<a id="blob-1"></a>

### Blob

> `const` **Blob**: `Schema.Struct`\<\{ `data`: `Schema.Uint8Array`; `ref`: `Schema.Struct`\<\{ `bytes`: `Schema.Int`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; `sha256`: `Schema.String`; \}\>; \}\>

**`Experimental`**

Stored content and its canonical reference.

***

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`BlobStore`](#blobstore), [`BlobStoreError`](#blobstoreerror), `Crypto.Crypto` \| `ObjectStore`\>

**`Experimental`**

Immutable object-backed content storage; requires no maintenance credentials.

#### Parameters

##### options

[`LayerOptions`](#layeroptions)

#### Returns

`Layer.Layer`\<[`BlobStore`](#blobstore), [`BlobStoreError`](#blobstoreerror), `Crypto.Crypto` \| `ObjectStore`\>

***

<a id="put-2"></a>

### Put

> `const` **Put**: `Schema.Struct`\<\{ `data`: `Schema.Uint8Array`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; \}\>

**`Experimental`**

Input accepted by `BlobStore.put`.
