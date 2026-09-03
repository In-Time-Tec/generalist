[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / RunTree

# RunTree

## Interfaces

### Checkpoint

Atomic point-in-time tree inspection and exclusive replay cursor.

#### Properties

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

##### inspection

> `readonly` **inspection**: [`Inspection`](#inspection-1)

***

### EventsInput

#### Extended by

- [`WatchInput`](#watchinput)

#### Properties

##### cursor?

> `readonly` `optional` **cursor?**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

##### rootRunId

> `readonly` **rootRunId**: `string`

***

### ReplayInput

Bounded replay strictly after an optional root-bound cursor.

#### Properties

##### cursor?

> `readonly` `optional` **cursor?**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

##### limit

> `readonly` **limit**: `number`

##### rootRunId

> `readonly` **rootRunId**: `string`

***

### ReplayPage

One bounded, ordered page read strictly after the requested cursor.

#### Properties

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

##### events

> `readonly` **events**: readonly [`TreeEvent`](#treeevent)[]

##### hasMore

> `readonly` **hasMore**: `boolean`

***

### TreeEvent

#### Properties

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

##### event

> `readonly` **event**: [`RunEvent`](./RunEvent#runevent)

##### invocationId?

> `readonly` `optional` **invocationId?**: `string`

##### modelAttemptId?

> `readonly` `optional` **modelAttemptId?**: `string`

##### modelCallId?

> `readonly` `optional` **modelCallId?**: `string`

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

##### rootRunId

> `readonly` **rootRunId**: `string`

##### runId

> `readonly` **runId**: `string`

##### toolCallId?

> `readonly` `optional` **toolCallId?**: `string`

***

### TreeRunInspection

#### Properties

##### invocationId?

> `readonly` `optional` **invocationId?**: `string`

##### outcome?

> `readonly` `optional` **outcome?**: [`RunOutcome`](./Run#runoutcome)

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

##### run

> `readonly` **run**: [`RunInspection`](./Run#runinspection)

***

### WatchInput

#### Extends

- [`EventsInput`](#eventsinput)

#### Properties

##### cursor?

> `readonly` `optional` **cursor?**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

[`EventsInput`](#eventsinput).[`cursor`](#cursor-1)

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

[`EventsInput`](#eventsinput).[`rootRunId`](#rootrunid)

##### settlement?

> `readonly` `optional` **settlement?**: `"tree-terminal"` \| `"root-blocked"`

## Type Aliases

### Inspection

> **Inspection** = `InspectionBase` & `object` \| `InspectionBase` & `object`

***

### TreeCursor

> **TreeCursor** = *typeof* `TreeCursor.Type`

## Variables

### awaitTerminal

> `const` **awaitTerminal**: (`rootRunId`) => `Effect.Effect`\<`Extract`\<[`Inspection`](#inspection-1), \{ `_tag`: `"Terminal"`; \}\>, [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

#### Parameters

##### rootRunId

`string`

#### Returns

`Effect.Effect`\<`Extract`\<[`Inspection`](#inspection-1), \{ `_tag`: `"Terminal"`; \}\>, [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

***

### checkpoint

> `const` **checkpoint**: (`rootRunId`) => `Effect.Effect`\<[`Checkpoint`](#checkpoint), [`InspectError`](./Runtime#inspecterror), [`Runtime`](./Runtime#runtime)\>

Atomically inspect one root Run tree and bind the inspection to its replay cursor.

#### Parameters

##### rootRunId

`string`

#### Returns

`Effect.Effect`\<[`Checkpoint`](#checkpoint), [`InspectError`](./Runtime#inspecterror), [`Runtime`](./Runtime#runtime)\>

***

### Checkpoint

> **Checkpoint**: `Codec`\<[`Checkpoint`](#checkpoint), `CheckpointEncoded`, `never`, `never`\>

***

### encodeCheckpoint

> `const` **encodeCheckpoint**: \{(`input`, `options?`): `Effect`\<`CheckpointEncoded`, `SchemaError`\>; (`options?`): (`input`) => `Effect`\<`CheckpointEncoded`, `SchemaError`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<`CheckpointEncoded`, `SchemaError`\>

##### Parameters

###### input

[`Checkpoint`](#checkpoint)

###### options?

`ParseOptions`

##### Returns

`Effect`\<`CheckpointEncoded`, `SchemaError`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`CheckpointEncoded`, `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`CheckpointEncoded`, `SchemaError`\>

***

### encodeInspection

> `const` **encodeInspection**: \{(`input`, `options?`): `Effect`\<`InspectionEncoded`, `SchemaError`\>; (`options?`): (`input`) => `Effect`\<`InspectionEncoded`, `SchemaError`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<`InspectionEncoded`, `SchemaError`\>

##### Parameters

###### input

[`Inspection`](#inspection-1)

###### options?

`ParseOptions`

##### Returns

`Effect`\<`InspectionEncoded`, `SchemaError`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`InspectionEncoded`, `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`InspectionEncoded`, `SchemaError`\>

***

### encodeReplayPage

> `const` **encodeReplayPage**: \{(`input`, `options?`): `Effect`\<`ReplayPageEncoded`, `SchemaError`\>; (`options?`): (`input`) => `Effect`\<`ReplayPageEncoded`, `SchemaError`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<`ReplayPageEncoded`, `SchemaError`\>

##### Parameters

###### input

[`ReplayPage`](#replaypage)

###### options?

`ParseOptions`

##### Returns

`Effect`\<`ReplayPageEncoded`, `SchemaError`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`ReplayPageEncoded`, `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`ReplayPageEncoded`, `SchemaError`\>

***

### encodeTreeEvent

> `const` **encodeTreeEvent**: \{(`input`, `options?`): `Effect`\<`TreeEventEncoded`, `SchemaError`\>; (`options?`): (`input`) => `Effect`\<`TreeEventEncoded`, `SchemaError`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<`TreeEventEncoded`, `SchemaError`\>

##### Parameters

###### input

[`TreeEvent`](#treeevent)

###### options?

`ParseOptions`

##### Returns

`Effect`\<`TreeEventEncoded`, `SchemaError`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`TreeEventEncoded`, `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`TreeEventEncoded`, `SchemaError`\>

***

### events

> `const` **events**: (`input`) => `Stream.Stream`\<[`TreeEvent`](#treeevent), [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

#### Parameters

##### input

[`EventsInput`](#eventsinput)

#### Returns

`Stream.Stream`\<[`TreeEvent`](#treeevent), [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

***

### Inspection

> **Inspection**: `Codec`\<[`Inspection`](#inspection-1), `InspectionEncoded`, `never`, `never`\>

***

### replay

> `const` **replay**: (`input`) => `Effect.Effect`\<[`ReplayPage`](#replaypage), [`TreeReplayError`](./Runtime#treereplayerror), [`Runtime`](./Runtime#runtime)\>

Read one bounded, ordered page strictly after the supplied cursor.

#### Parameters

##### input

[`ReplayInput`](#replayinput)

#### Returns

`Effect.Effect`\<[`ReplayPage`](#replaypage), [`TreeReplayError`](./Runtime#treereplayerror), [`Runtime`](./Runtime#runtime)\>

***

### ReplayPage

> **ReplayPage**: `Codec`\<[`ReplayPage`](#replaypage), `ReplayPageEncoded`, `never`, `never`\>

***

### TreeCursor

> `const` **TreeCursor**: `Schema.brand`\<`Schema.String`, `"generalist/runtime/TreeCursor"`\>

***

### TreeEvent

> **TreeEvent**: `Codec`\<[`TreeEvent`](#treeevent), `TreeEventEncoded`, `never`, `never`\>

***

### TreeRunInspection

> **TreeRunInspection**: `Codec`\<[`TreeRunInspection`](#treeruninspection), `TreeRunInspectionEncoded`, `never`, `never`\>

***

### watch

> `const` **watch**: (`input`) => `Stream.Stream`\<[`TreeEvent`](#treeevent), [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

#### Parameters

##### input

[`WatchInput`](#watchinput)

#### Returns

`Stream.Stream`\<[`TreeEvent`](#treeevent), [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

## Functions

### decodeCheckpoint()

#### Call Signature

> **decodeCheckpoint**(`input`, `options?`): `Effect`\<[`Checkpoint`](#checkpoint), `SchemaError`\>

##### Parameters

###### input

`CheckpointEncoded`

###### options?

`ParseOptions`

##### Returns

`Effect`\<[`Checkpoint`](#checkpoint), `SchemaError`\>

#### Call Signature

> **decodeCheckpoint**(`options?`): (`input`) => `Effect`\<[`Checkpoint`](#checkpoint), `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<[`Checkpoint`](#checkpoint), `SchemaError`\>

***

### decodeInspection()

#### Call Signature

> **decodeInspection**(`input`, `options?`): `Effect`\<[`Inspection`](#inspection-1), `SchemaError`\>

##### Parameters

###### input

`InspectionEncoded`

###### options?

`ParseOptions`

##### Returns

`Effect`\<[`Inspection`](#inspection-1), `SchemaError`\>

#### Call Signature

> **decodeInspection**(`options?`): (`input`) => `Effect`\<[`Inspection`](#inspection-1), `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<[`Inspection`](#inspection-1), `SchemaError`\>

***

### decodeReplayPage()

#### Call Signature

> **decodeReplayPage**(`input`, `options?`): `Effect`\<[`ReplayPage`](#replaypage), `SchemaError`\>

##### Parameters

###### input

`ReplayPageEncoded`

###### options?

`ParseOptions`

##### Returns

`Effect`\<[`ReplayPage`](#replaypage), `SchemaError`\>

#### Call Signature

> **decodeReplayPage**(`options?`): (`input`) => `Effect`\<[`ReplayPage`](#replaypage), `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<[`ReplayPage`](#replaypage), `SchemaError`\>

***

### decodeTreeEvent()

#### Call Signature

> **decodeTreeEvent**(`input`, `options?`): `Effect`\<[`TreeEvent`](#treeevent), `SchemaError`\>

##### Parameters

###### input

`TreeEventEncoded`

###### options?

`ParseOptions`

##### Returns

`Effect`\<[`TreeEvent`](#treeevent), `SchemaError`\>

#### Call Signature

> **decodeTreeEvent**(`options?`): (`input`) => `Effect`\<[`TreeEvent`](#treeevent), `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<[`TreeEvent`](#treeevent), `SchemaError`\>
