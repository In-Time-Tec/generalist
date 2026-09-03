[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Watcher

# Watcher

## Classes

<a id="watcher"></a>

### Watcher

#### Extends

- `Watcher_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new Watcher**(`_`): [`Watcher`](#watcher)

###### Parameters

###### \_

`never`

###### Returns

[`Watcher`](#watcher)

###### Inherited from

`Watcher_base.constructor`

## Interfaces

<a id="service"></a>

### Service

#### Properties

<a id="watch"></a>

##### watch

> `readonly` **watch**: (`options`) => `Stream`\<\{ `dedupeKey`: `string`; `kind`: `"create"` \| `"remove"` \| `"update"`; `path`: `string`; \}, `PlatformError`\>

Stream typed file changes from the host FileSystem watch capability.

###### Parameters

###### options

[`WatchOptions`](#watchoptions)

###### Returns

`Stream`\<\{ `dedupeKey`: `string`; `kind`: `"create"` \| `"remove"` \| `"update"`; `path`: `string`; \}, `PlatformError`\>

***

<a id="watchoptions"></a>

### WatchOptions

#### Properties

<a id="path"></a>

##### path

> `readonly` **path**: `string`

<a id="recursive"></a>

##### recursive?

> `readonly` `optional` **recursive?**: `boolean`

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: `Layer.Layer`\<[`Watcher`](#watcher), `never`, `FileSystem.FileSystem`\>

FileSystem-backed environmental watch capability. Unsupported hosts omit this Layer.

***

<a id="make"></a>

### make

> `const` **make**: `Effect.Effect`\<[`Service`](#service), `never`, `FileSystem.FileSystem`\>
