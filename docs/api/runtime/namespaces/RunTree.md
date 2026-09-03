[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / RunTree

# RunTree

## Interfaces

<a id="checkpoint"></a>

### Checkpoint

Atomic point-in-time tree inspection and exclusive replay cursor.

#### Properties

<a id="cursor"></a>

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

<a id="inspection"></a>

##### inspection

> `readonly` **inspection**: [`Inspection`](#inspection-1)

***

<a id="eventsinput"></a>

### EventsInput

#### Extended by

- [`WatchInput`](#watchinput)

#### Properties

<a id="cursor-1"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

<a id="rootrunid"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

***

<a id="replayinput"></a>

### ReplayInput

Bounded replay strictly after an optional root-bound cursor.

#### Properties

<a id="cursor-2"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

<a id="limit"></a>

##### limit

> `readonly` **limit**: `number`

<a id="rootrunid-1"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

***

<a id="replaypage"></a>

### ReplayPage

One bounded, ordered page read strictly after the requested cursor.

#### Properties

<a id="cursor-3"></a>

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

<a id="events"></a>

##### events

> `readonly` **events**: readonly [`TreeEvent`](#treeevent)[]

<a id="hasmore"></a>

##### hasMore

> `readonly` **hasMore**: `boolean`

***

<a id="treeevent"></a>

### TreeEvent

#### Properties

<a id="cursor-4"></a>

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

<a id="event"></a>

##### event

> `readonly` **event**: [`RunEvent`](./RunEvent#runevent)

<a id="invocationid"></a>

##### invocationId?

> `readonly` `optional` **invocationId?**: `string`

<a id="modelattemptid"></a>

##### modelAttemptId?

> `readonly` `optional` **modelAttemptId?**: `string`

<a id="modelcallid"></a>

##### modelCallId?

> `readonly` `optional` **modelCallId?**: `string`

<a id="parentrunid"></a>

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

<a id="rootrunid-2"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

<a id="toolcallid"></a>

##### toolCallId?

> `readonly` `optional` **toolCallId?**: `string`

***

<a id="treeruninspection"></a>

### TreeRunInspection

#### Properties

<a id="invocationid-1"></a>

##### invocationId?

> `readonly` `optional` **invocationId?**: `string`

<a id="outcome"></a>

##### outcome?

> `readonly` `optional` **outcome?**: [`RunOutcome`](./Run#runoutcome)

<a id="parentrunid-1"></a>

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

<a id="run"></a>

##### run

> `readonly` **run**: [`RunInspection`](./Run#runinspection)

***

<a id="watchinput"></a>

### WatchInput

#### Extends

- [`EventsInput`](#eventsinput)

#### Properties

<a id="cursor-5"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

[`EventsInput`](#eventsinput).[`cursor`](#cursor-1)

<a id="rootrunid-3"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

[`EventsInput`](#eventsinput).[`rootRunId`](#rootrunid)

<a id="settlement"></a>

##### settlement?

> `readonly` `optional` **settlement?**: `"tree-terminal"` \| `"root-blocked"`

## Type Aliases

<a id="inspection-1"></a>

### Inspection

> **Inspection** = `InspectionBase` & `object` \| `InspectionBase` & `object`

***

<a id="treecursor"></a>

### TreeCursor

> **TreeCursor** = *typeof* `TreeCursor.Type`

## Variables

<a id="awaitterminal"></a>

### awaitTerminal

> `const` **awaitTerminal**: (`rootRunId`) => `Effect.Effect`\<`Extract`\<[`Inspection`](#inspection-1), \{ `_tag`: `"Terminal"`; \}\>, [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

#### Parameters

##### rootRunId

`string`

#### Returns

`Effect.Effect`\<`Extract`\<[`Inspection`](#inspection-1), \{ `_tag`: `"Terminal"`; \}\>, [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

***

<a id="checkpoint-1"></a>

### checkpoint

> `const` **checkpoint**: (`rootRunId`) => `Effect.Effect`\<[`Checkpoint`](#checkpoint), [`InspectError`](./Runtime#inspecterror), [`Runtime`](./Runtime#runtime)\>

Atomically inspect one root Run tree and bind the inspection to its replay cursor.

#### Parameters

##### rootRunId

`string`

#### Returns

`Effect.Effect`\<[`Checkpoint`](#checkpoint), [`InspectError`](./Runtime#inspecterror), [`Runtime`](./Runtime#runtime)\>

***

<a id="checkpoint-2"></a>

### Checkpoint

> **Checkpoint**: `Codec`\<[`Checkpoint`](#checkpoint), `CheckpointEncoded`, `never`, `never`\>

***

<a id="encodecheckpoint"></a>

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

<a id="encodeinspection"></a>

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

<a id="encodereplaypage"></a>

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

<a id="encodetreeevent"></a>

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

<a id="events-1"></a>

### events

> `const` **events**: (`input`) => `Stream.Stream`\<[`TreeEvent`](#treeevent), [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

#### Parameters

##### input

[`EventsInput`](#eventsinput)

#### Returns

`Stream.Stream`\<[`TreeEvent`](#treeevent), [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

***

<a id="inspection-2"></a>

### Inspection

> **Inspection**: `Codec`\<[`Inspection`](#inspection-1), `InspectionEncoded`, `never`, `never`\>

***

<a id="replay"></a>

### replay

> `const` **replay**: (`input`) => `Effect.Effect`\<[`ReplayPage`](#replaypage), [`TreeReplayError`](./Runtime#treereplayerror), [`Runtime`](./Runtime#runtime)\>

Read one bounded, ordered page strictly after the supplied cursor.

#### Parameters

##### input

[`ReplayInput`](#replayinput)

#### Returns

`Effect.Effect`\<[`ReplayPage`](#replaypage), [`TreeReplayError`](./Runtime#treereplayerror), [`Runtime`](./Runtime#runtime)\>

***

<a id="replaypage-1"></a>

### ReplayPage

> **ReplayPage**: `Codec`\<[`ReplayPage`](#replaypage), `ReplayPageEncoded`, `never`, `never`\>

***

<a id="treecursor-1"></a>

### TreeCursor

> `const` **TreeCursor**: `Schema.brand`\<`Schema.String`, `"generalist/runtime/TreeCursor"`\>

***

<a id="treeevent-1"></a>

### TreeEvent

> **TreeEvent**: `Codec`\<[`TreeEvent`](#treeevent), `TreeEventEncoded`, `never`, `never`\>

***

<a id="treeruninspection-1"></a>

### TreeRunInspection

> **TreeRunInspection**: `Codec`\<[`TreeRunInspection`](#treeruninspection), `TreeRunInspectionEncoded`, `never`, `never`\>

***

<a id="watch"></a>

### watch

> `const` **watch**: (`input`) => `Stream.Stream`\<[`TreeEvent`](#treeevent), [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

#### Parameters

##### input

[`WatchInput`](#watchinput)

#### Returns

`Stream.Stream`\<[`TreeEvent`](#treeevent), [`TreeEventsError`](./Runtime#treeeventserror), [`Runtime`](./Runtime#runtime)\>

## Functions

<a id="decodecheckpoint"></a>

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

<a id="decodeinspection"></a>

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

<a id="decodereplaypage"></a>

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

<a id="decodetreeevent"></a>

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
