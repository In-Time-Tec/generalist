[**generalist**](./index)

***

[generalist](./index) / media

# media

## Classes

<a id="mediareaderror"></a>

### MediaReadError

**`Experimental`**

Media bytes could not be read from the requested platform path.

#### Extends

- `MediaReadError_base`

#### Constructors

<a id="constructor"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`MediaReadError_base.hint`

<a id="path"></a>

##### path

> `readonly` **path**: `string`

**`Experimental`**

###### Inherited from

`MediaReadError_base.path`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `string`

**`Experimental`**

###### Inherited from

`MediaReadError_base.reason`

***

<a id="mediatypeunsupported"></a>

### MediaTypeUnsupported

**`Experimental`**

A file extension cannot be mapped to a supported media type.

#### Extends

- `MediaTypeUnsupported_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`MediaTypeUnsupported_base.hint`

<a id="path-1"></a>

##### path

> `readonly` **path**: `string`

**`Experimental`**

###### Inherited from

`MediaTypeUnsupported_base.path`

## Interfaces

<a id="frompathoptions"></a>

### FromPathOptions

**`Experimental`**

Optional media metadata overrides for `Media.fromPath`.

#### Properties

<a id="filename"></a>

##### filename?

> `readonly` `optional` **filename?**: `string`

**`Experimental`**

<a id="mediatype"></a>

##### mediaType?

> `readonly` `optional` **mediaType?**: `string`

**`Experimental`**

## Type Aliases

<a id="frompatherror"></a>

### FromPathError

> **FromPathError** = [`MediaTypeUnsupported`](#mediatypeunsupported) \| [`MediaReadError`](#mediareaderror) \| [`BlobStoreError`](./blob-store#blobstoreerror) \| [`BlobTooLarge`](./blob-store#blobtoolarge)

**`Experimental`**

Typed failures returned by `Media.fromPath`.

***

<a id="ref"></a>

### Ref

> **Ref** = *typeof* `Ref.Type`

**`Experimental`**

Content-addressed reference persisted in prompts, journals, and API payloads.

## Variables

<a id="file"></a>

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

<a id="frompath"></a>

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

<a id="part"></a>

### part

> `const` **part**: *typeof* `makePart`

**`Experimental`**

Create a durable Effect AI file part containing only a Media.Ref marker.

***

<a id="ref-1"></a>

### Ref

> `const` **Ref**: `Schema.Struct`\<\{ `bytes`: `Schema.Int`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; `sha256`: `Schema.String`; \}\>

**`Experimental`**

Content-addressed reference persisted in prompts, journals, and API payloads.

***

<a id="resolve"></a>

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

<a id="refvalue"></a>

### RefValue

Renames and re-exports [Ref](#ref-1)
