[**generalist**](./index)

***

[generalist](./index) / media

# media

## Classes

### MediaReadError

**`Experimental`**

Media bytes could not be read from the requested platform path.

#### Extends

- `MediaReadError_base`

#### Constructors

##### Constructor

> **new MediaReadError**(...`args`): [`MediaReadError`](#mediareaderror)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`MediaReadError`](#mediareaderror)

###### Inherited from

`MediaReadError_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`MediaReadError_base.hint`

##### path

> `readonly` **path**: `string`

**`Experimental`**

###### Inherited from

`MediaReadError_base.path`

##### reason

> `readonly` **reason**: `string`

**`Experimental`**

###### Inherited from

`MediaReadError_base.reason`

***

### MediaTypeUnsupported

**`Experimental`**

A file extension cannot be mapped to a supported media type.

#### Extends

- `MediaTypeUnsupported_base`

#### Constructors

##### Constructor

> **new MediaTypeUnsupported**(...`args`): [`MediaTypeUnsupported`](#mediatypeunsupported)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`MediaTypeUnsupported`](#mediatypeunsupported)

###### Inherited from

`MediaTypeUnsupported_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`MediaTypeUnsupported_base.hint`

##### path

> `readonly` **path**: `string`

**`Experimental`**

###### Inherited from

`MediaTypeUnsupported_base.path`

## Interfaces

### FromPathOptions

**`Experimental`**

Optional media metadata overrides for `Media.fromPath`.

#### Properties

##### filename?

> `readonly` `optional` **filename?**: `string`

**`Experimental`**

##### mediaType?

> `readonly` `optional` **mediaType?**: `string`

**`Experimental`**

## Type Aliases

### FromPathError

> **FromPathError** = [`MediaTypeUnsupported`](#mediatypeunsupported) \| [`MediaReadError`](#mediareaderror) \| [`BlobStoreError`](./blob-store#blobstoreerror) \| [`BlobTooLarge`](./blob-store#blobtoolarge)

**`Experimental`**

Typed failures returned by `Media.fromPath`.

***

### Ref

> **Ref** = *typeof* `Ref.Type`

**`Experimental`**

Content-addressed reference persisted in prompts, journals, and API payloads.

## Variables

### File

> `const` **File**: \<`MediaType`\>(`options`) => `Schema.Struct`\<\{ `bytes`: `Schema.Int`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; `sha256`: `Schema.String`; \}\>

**`Experimental`**

Schema for a typed Agent field containing media of one declared media type.

#### Type Parameters

##### MediaType

`MediaType` *extends* `string`

#### Parameters

##### options

###### mediaType

`MediaType`

#### Returns

`Schema.Struct`\<\{ `bytes`: `Schema.Int`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; `sha256`: `Schema.String`; \}\>

***

### fromPath

> `const` **fromPath**: (`pathValue`, `options?`) => `Effect.Effect`\<\{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}, [`BlobStoreError`](./blob-store#blobstoreerror) \| [`BlobTooLarge`](./blob-store#blobtoolarge) \| [`MediaReadError`](#mediareaderror) \| [`MediaTypeUnsupported`](#mediatypeunsupported), [`BlobStore`](./blob-store#blobstore) \| `FileSystem.FileSystem` \| `Path.Path`\>

**`Experimental`**

Reads one platform file into BlobStore and returns its durable content reference.

#### Parameters

##### pathValue

`string`

##### options?

[`FromPathOptions`](#frompathoptions)

#### Returns

`Effect.Effect`\<\{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}, [`BlobStoreError`](./blob-store#blobstoreerror) \| [`BlobTooLarge`](./blob-store#blobtoolarge) \| [`MediaReadError`](#mediareaderror) \| [`MediaTypeUnsupported`](#mediatypeunsupported), [`BlobStore`](./blob-store#blobstore) \| `FileSystem.FileSystem` \| `Path.Path`\>

***

### part

> `const` **part**: *typeof* `makePart`

**`Experimental`**

Create a durable Effect AI file part containing only a Media.Ref marker.

***

### Ref

> `const` **Ref**: `Schema.Struct`\<\{ `bytes`: `Schema.Int`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; `sha256`: `Schema.String`; \}\>

**`Experimental`**

Content-addressed reference persisted in prompts, journals, and API payloads.

***

### resolve

> `const` **resolve**: (`ref`, `preference?`) => `Effect.Effect`\<`FilePart`, [`BlobNotFound`](./blob-store#blobnotfound) \| [`BlobStoreError`](./blob-store#blobstoreerror), [`BlobStore`](./blob-store#blobstore)\>

**`Experimental`**

Resolve a Media.Ref to provider-ready bytes or a URL from BlobStore.

#### Parameters

##### ref

###### bytes

`number`

###### filename?

`string`

###### mediaType

`string`

###### sha256

`string`

##### preference?

`"bytes"` \| `"url"`

#### Returns

`Effect.Effect`\<`FilePart`, [`BlobNotFound`](./blob-store#blobnotfound) \| [`BlobStoreError`](./blob-store#blobstoreerror), [`BlobStore`](./blob-store#blobstore)\>

## References

### RefValue

Renames and re-exports [Ref](#ref-1)
