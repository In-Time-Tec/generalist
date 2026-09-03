[**generalist**](./index)

***

[generalist](./index) / blob-store

# blob-store

## Classes

### BlobNotFound

**`Experimental`**

No content exists for the requested SHA-256 digest.

#### Extends

- `BlobNotFound_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`BlobNotFound_base.hint`

##### sha256

> `readonly` **sha256**: `string`

**`Experimental`**

###### Inherited from

`BlobNotFound_base.sha256`

***

### BlobStore

**`Experimental`**

Content-addressed BlobStore service.

#### Extends

- `BlobStore_base`

#### Constructors

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

### BlobStoreError

**`Experimental`**

A BlobStore backend operation failed.

#### Extends

- `BlobStoreError_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`BlobStoreError_base.hint`

##### operation

> `readonly` **operation**: `string`

**`Experimental`**

###### Inherited from

`BlobStoreError_base.operation`

##### reason

> `readonly` **reason**: `string`

**`Experimental`**

###### Inherited from

`BlobStoreError_base.reason`

***

### BlobTooLarge

**`Experimental`**

Content exceeds the configured byte limit.

#### Extends

- `BlobTooLarge_base`

#### Constructors

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

##### bytes

> `readonly` **bytes**: `number`

**`Experimental`**

###### Inherited from

`BlobTooLarge_base.bytes`

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`BlobTooLarge_base.hint`

##### maxBytes

> `readonly` **maxBytes**: `number`

**`Experimental`**

###### Inherited from

`BlobTooLarge_base.maxBytes`

## Interfaces

### FileSystemOptions

**`Experimental`**

Content-addressed filesystem Layer options.

#### Extends

- [`LayerOptions`](#layeroptions)

#### Properties

##### dir

> `readonly` **dir**: `string`

**`Experimental`**

##### maxBytes?

> `readonly` `optional` **maxBytes?**: `number`

**`Experimental`**

###### Inherited from

[`LayerOptions`](#layeroptions).[`maxBytes`](#maxbytes-2)

***

### LayerOptions

**`Experimental`**

Shared BlobStore Layer options.

#### Extended by

- [`FileSystemOptions`](#filesystemoptions)
- [`S3Options`](#s3options)

#### Properties

##### maxBytes?

> `readonly` `optional` **maxBytes?**: `number`

**`Experimental`**

***

### ResolvedBlob

**`Experimental`**

Provider-ready content and its canonical stored reference.

#### Properties

##### data

> `readonly` **data**: `Uint8Array`\<`ArrayBufferLike`\> \| `URL`

**`Experimental`**

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

### ResolveOptions

**`Experimental`**

Provider transport preference for resolving a reference.

#### Properties

##### prefer

> `readonly` **prefer**: `"bytes"` \| `"url"`

**`Experimental`**

***

### S3Client

**`Experimental`**

Minimal S3-compatible client needed by BlobStore.

#### Type Parameters

##### E

`E` = `unknown`

#### Properties

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

### S3Object

**`Experimental`**

One object exchanged with an injected S3-compatible client.

#### Properties

##### data

> `readonly` **data**: `Uint8Array`

**`Experimental`**

##### filename?

> `readonly` `optional` **filename?**: `string`

**`Experimental`**

##### mediaType

> `readonly` **mediaType**: `string`

**`Experimental`**

##### url?

> `readonly` `optional` **url?**: `URL`

**`Experimental`**

***

### S3Options

**`Experimental`**

S3-compatible BlobStore Layer options.

#### Extends

- [`LayerOptions`](#layeroptions)

#### Type Parameters

##### E

`E` = `unknown`

#### Properties

##### bucket

> `readonly` **bucket**: `string`

**`Experimental`**

##### client

> `readonly` **client**: [`S3Client`](#s3client)\<`E`\>

**`Experimental`**

##### maxBytes?

> `readonly` `optional` **maxBytes?**: `number`

**`Experimental`**

###### Inherited from

[`LayerOptions`](#layeroptions).[`maxBytes`](#maxbytes-2)

***

### Service

**`Experimental`**

Content-addressed storage operations.

#### Properties

##### get

> `readonly` **get**: (`sha256`) => `Effect`\<\{ `data`: `Uint8Array`; `ref`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; \}, [`BlobNotFound`](#blobnotfound) \| [`BlobStoreError`](#blobstoreerror)\>

**`Experimental`**

###### Parameters

###### sha256

`string`

###### Returns

`Effect`\<\{ `data`: `Uint8Array`; `ref`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; \}, [`BlobNotFound`](#blobnotfound) \| [`BlobStoreError`](#blobstoreerror)\>

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

### Blob

> **Blob** = *typeof* `Blob.Type`

**`Experimental`**

Stored content and its canonical reference.

***

### Put

> **Put** = *typeof* `Put.Type`

**`Experimental`**

Input accepted by `BlobStore.put`.

## Variables

### Blob

> `const` **Blob**: `Schema.Struct`\<\{ `data`: `Schema.Uint8Array`; `ref`: `Schema.Struct`\<\{ `bytes`: `Schema.Int`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; `sha256`: `Schema.String`; \}\>; \}\>

**`Experimental`**

Stored content and its canonical reference.

***

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

### Put

> `const` **Put**: `Schema.Struct`\<\{ `data`: `Schema.Uint8Array`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; \}\>

**`Experimental`**

Input accepted by `BlobStore.put`.
