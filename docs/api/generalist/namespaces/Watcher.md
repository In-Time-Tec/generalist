[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Watcher

# Watcher

## Classes

### Watcher

#### Extends

- `Watcher_base`

#### Constructors

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

### Service

#### Properties

##### watch

> `readonly` **watch**: (`options`) => `Stream`\<\{ `dedupeKey`: `string`; `kind`: `"create"` \| `"remove"` \| `"update"`; `path`: `string`; \}, `PlatformError`\>

Stream typed file changes from the host FileSystem watch capability.

###### Parameters

###### options

[`WatchOptions`](#watchoptions)

###### Returns

`Stream`\<\{ `dedupeKey`: `string`; `kind`: `"create"` \| `"remove"` \| `"update"`; `path`: `string`; \}, `PlatformError`\>

***

### WatchOptions

#### Properties

##### path

> `readonly` **path**: `string`

##### recursive?

> `readonly` `optional` **recursive?**: `boolean`

## Variables

### layer

> `const` **layer**: `Layer.Layer`\<[`Watcher`](#watcher), `never`, `FileSystem.FileSystem`\>

FileSystem-backed environmental watch capability. Unsupported hosts omit this Layer.

***

### make

> `const` **make**: `Effect.Effect`\<[`Service`](#service), `never`, `FileSystem.FileSystem`\>
