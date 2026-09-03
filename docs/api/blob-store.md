[**generalist**](./index)

***

[generalist](./index) / blob-store

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

A BlobStore backend operation failed.

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

<a id="filesystemoptions"></a>

### FileSystemOptions

**`Experimental`**

Content-addressed filesystem Layer options.

#### Extends

- [`LayerOptions`](#layeroptions)

#### Properties

<a id="dir"></a>

##### dir

> `readonly` **dir**: `string`

**`Experimental`**

<a id="maxbytes-1"></a>

##### maxBytes?

> `readonly` `optional` **maxBytes?**: `number`

**`Experimental`**

###### Inherited from

[`LayerOptions`](#layeroptions).[`maxBytes`](#maxbytes-2)

***

<a id="layeroptions"></a>

### LayerOptions

**`Experimental`**

Shared BlobStore Layer options.

#### Extended by

- [`FileSystemOptions`](#filesystemoptions)
- [`S3Options`](#s3options)

#### Properties

<a id="maxbytes-2"></a>

##### maxBytes?

> `readonly` `optional` **maxBytes?**: `number`

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

<a id="s3client"></a>

### S3Client

**`Experimental`**

Minimal S3-compatible client needed by BlobStore.

#### Type Parameters

##### E

`E` = `unknown`

#### Properties

<a id="get"></a>

##### get

> `readonly` **get**: (`bucket`, `key`) => `Effect`\<`Option`\<[`S3Object`](#s3object)\>, `E`\>

**`Experimental`**

###### Parameters

###### bucket

`string`

###### key

`string`

###### Returns

`Effect`\<`Option`\<[`S3Object`](#s3object)\>, `E`\>

<a id="head"></a>

##### head

> `readonly` **head**: (`bucket`, `key`) => `Effect`\<`boolean`, `E`\>

**`Experimental`**

###### Parameters

###### bucket

`string`

###### key

`string`

###### Returns

`Effect`\<`boolean`, `E`\>

<a id="put"></a>

##### put

> `readonly` **put**: (`bucket`, `key`, `object`) => `Effect`\<`void`, `E`\>

**`Experimental`**

###### Parameters

###### bucket

`string`

###### key

`string`

###### object

[`S3Object`](#s3object)

###### Returns

`Effect`\<`void`, `E`\>

***

<a id="s3object"></a>

### S3Object

**`Experimental`**

One object exchanged with an injected S3-compatible client.

#### Properties

<a id="data-1"></a>

##### data

> `readonly` **data**: `Uint8Array`

**`Experimental`**

<a id="filename"></a>

##### filename?

> `readonly` `optional` **filename?**: `string`

**`Experimental`**

<a id="mediatype"></a>

##### mediaType

> `readonly` **mediaType**: `string`

**`Experimental`**

<a id="url"></a>

##### url?

> `readonly` `optional` **url?**: `URL`

**`Experimental`**

***

<a id="s3options"></a>

### S3Options

**`Experimental`**

S3-compatible BlobStore Layer options.

#### Extends

- [`LayerOptions`](#layeroptions)

#### Type Parameters

##### E

`E` = `unknown`

#### Properties

<a id="bucket"></a>

##### bucket

> `readonly` **bucket**: `string`

**`Experimental`**

<a id="client"></a>

##### client

> `readonly` **client**: [`S3Client`](#s3client)\<`E`\>

**`Experimental`**

<a id="maxbytes-3"></a>

##### maxBytes?

> `readonly` `optional` **maxBytes?**: `number`

**`Experimental`**

###### Inherited from

[`LayerOptions`](#layeroptions).[`maxBytes`](#maxbytes-2)

***

<a id="service"></a>

### Service

**`Experimental`**

Content-addressed storage operations.

#### Properties

<a id="get-1"></a>

##### get

> `readonly` **get**: (`sha256`) => `Effect`\<\{ `data`: `Uint8Array`; `ref`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; \}, [`BlobNotFound`](#blobnotfound) \| [`BlobStoreError`](#blobstoreerror)\>

**`Experimental`**

###### Parameters

###### sha256

`string`

###### Returns

`Effect`\<\{ `data`: `Uint8Array`; `ref`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; \}, [`BlobNotFound`](#blobnotfound) \| [`BlobStoreError`](#blobstoreerror)\>

<a id="put-1"></a>

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

<a id="put-2"></a>

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

<a id="layerfilesystem"></a>

### layerFileSystem

> `const` **layerFileSystem**: (`options`) => `Layer.Layer`\<[`BlobStore`](#blobstore), [`BlobStoreError`](#blobstoreerror), `Crypto.Crypto` \| `FileSystem.FileSystem` \| `Path.Path`\>

**`Experimental`**

Content-addressed files with a schema-encoded metadata sidecar.

#### Parameters

##### options

[`FileSystemOptions`](#filesystemoptions)

#### Returns

`Layer.Layer`\<[`BlobStore`](#blobstore), [`BlobStoreError`](#blobstoreerror), `Crypto.Crypto` \| `FileSystem.FileSystem` \| `Path.Path`\>

***

<a id="layermemory"></a>

### layerMemory

> `const` **layerMemory**: (`options?`) => `Layer.Layer`\<[`BlobStore`](#blobstore), `never`, `Crypto.Crypto`\>

**`Experimental`**

Process-local content-addressed storage.

#### Parameters

##### options?

[`LayerOptions`](#layeroptions)

#### Returns

`Layer.Layer`\<[`BlobStore`](#blobstore), `never`, `Crypto.Crypto`\>

***

<a id="layers3"></a>

### layerS3

> `const` **layerS3**: \<`E`\>(`options`) => `Layer.Layer`\<[`BlobStore`](#blobstore), `never`, `Crypto.Crypto`\>

**`Experimental`**

S3-compatible storage through an injected client; no AWS SDK is required.

#### Type Parameters

##### E

`E`

#### Parameters

##### options

[`S3Options`](#s3options)\<`E`\>

#### Returns

`Layer.Layer`\<[`BlobStore`](#blobstore), `never`, `Crypto.Crypto`\>

***

<a id="layersql"></a>

### layerSql

> `const` **layerSql**: (`options?`) => `Layer.Layer`\<[`BlobStore`](#blobstore), [`BlobStoreError`](#blobstoreerror), `Crypto.Crypto` \| `SqlClient.SqlClient`\>

**`Experimental`**

Portable SQL storage over the runtime SqlClient seam.

#### Parameters

##### options?

[`LayerOptions`](#layeroptions)

#### Returns

`Layer.Layer`\<[`BlobStore`](#blobstore), [`BlobStoreError`](#blobstoreerror), `Crypto.Crypto` \| `SqlClient.SqlClient`\>

***

<a id="put-3"></a>

### Put

> `const` **Put**: `Schema.Struct`\<\{ `data`: `Schema.Uint8Array`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; \}\>

**`Experimental`**

Input accepted by `BlobStore.put`.
