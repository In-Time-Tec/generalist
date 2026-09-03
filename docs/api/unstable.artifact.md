[**generalist**](./index)

***

[generalist](./index) / unstable.artifact

# unstable.artifact

## Classes

<a id="artifactalreadyopen"></a>

### ArtifactAlreadyOpen

An artifact name was registered twice in one process.

#### Extends

- `ArtifactAlreadyOpen_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ArtifactAlreadyOpen**(...`args`): [`ArtifactAlreadyOpen`](#artifactalreadyopen)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ArtifactAlreadyOpen`](#artifactalreadyopen)

###### Inherited from

`ArtifactAlreadyOpen_base.constructor`

#### Properties

<a id="artifact"></a>

##### artifact

> `readonly` **artifact**: `string`

###### Inherited from

`ArtifactAlreadyOpen_base.artifact`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ArtifactAlreadyOpen_base.hint`

***

<a id="artifactbasestale"></a>

### ArtifactBaseStale

A model edit did not use the version recorded by its last artifact read.

#### Extends

- `ArtifactBaseStale_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new ArtifactBaseStale**(...`args`): [`ArtifactBaseStale`](#artifactbasestale)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ArtifactBaseStale`](#artifactbasestale)

###### Inherited from

`ArtifactBaseStale_base.constructor`

#### Properties

<a id="artifact-1"></a>

##### artifact

> `readonly` **artifact**: `string`

###### Inherited from

`ArtifactBaseStale_base.artifact`

<a id="base"></a>

##### base

> `readonly` **base**: `number`

###### Inherited from

`ArtifactBaseStale_base.base`

<a id="expected"></a>

##### expected?

> `readonly` `optional` **expected?**: `number`

###### Inherited from

`ArtifactBaseStale_base.expected`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ArtifactBaseStale_base.hint`

***

<a id="artifactcrdt"></a>

### ArtifactCrdt

**`Experimental`**

CRDT implementation selected by `Artifact.open`.

#### Extends

- `ArtifactCrdt_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new ArtifactCrdt**(`_`): [`ArtifactCrdt`](#artifactcrdt)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`ArtifactCrdt`](#artifactcrdt)

###### Inherited from

`ArtifactCrdt_base.constructor`

***

<a id="artifactcrdtmismatch"></a>

### ArtifactCrdtMismatch

One artifact name was opened with two incompatible CRDT implementations.

#### Extends

- `ArtifactCrdtMismatch_base`

#### Constructors

<a id="constructor-3"></a>

##### Constructor

> **new ArtifactCrdtMismatch**(...`args`): [`ArtifactCrdtMismatch`](#artifactcrdtmismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ArtifactCrdtMismatch`](#artifactcrdtmismatch)

###### Inherited from

`ArtifactCrdtMismatch_base.constructor`

#### Properties

<a id="actual"></a>

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`ArtifactCrdtMismatch_base.actual`

<a id="artifact-2"></a>

##### artifact

> `readonly` **artifact**: `string`

###### Inherited from

`ArtifactCrdtMismatch_base.artifact`

<a id="expected-1"></a>

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`ArtifactCrdtMismatch_base.expected`

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ArtifactCrdtMismatch_base.hint`

***

<a id="artifactnotfound"></a>

### ArtifactNotFound

A requested artifact is not registered in this process or runtime store.

#### Extends

- `ArtifactNotFound_base`

#### Constructors

<a id="constructor-4"></a>

##### Constructor

> **new ArtifactNotFound**(...`args`): [`ArtifactNotFound`](#artifactnotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ArtifactNotFound`](#artifactnotfound)

###### Inherited from

`ArtifactNotFound_base.constructor`

#### Properties

<a id="artifact-3"></a>

##### artifact

> `readonly` **artifact**: `string`

###### Inherited from

`ArtifactNotFound_base.artifact`

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ArtifactNotFound_base.hint`

***

<a id="artifactrangeinvalid"></a>

### ArtifactRangeInvalid

A range is outside the text at the operation's declared base version.

#### Extends

- `ArtifactRangeInvalid_base`

#### Constructors

<a id="constructor-5"></a>

##### Constructor

> **new ArtifactRangeInvalid**(...`args`): [`ArtifactRangeInvalid`](#artifactrangeinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ArtifactRangeInvalid`](#artifactrangeinvalid)

###### Inherited from

`ArtifactRangeInvalid_base.constructor`

#### Properties

<a id="artifact-4"></a>

##### artifact

> `readonly` **artifact**: `string`

###### Inherited from

`ArtifactRangeInvalid_base.artifact`

<a id="from"></a>

##### from

> `readonly` **from**: `number`

###### Inherited from

`ArtifactRangeInvalid_base.from`

<a id="hint-4"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ArtifactRangeInvalid_base.hint`

<a id="length"></a>

##### length

> `readonly` **length**: `number`

###### Inherited from

`ArtifactRangeInvalid_base.length`

<a id="to"></a>

##### to

> `readonly` **to**: `number`

###### Inherited from

`ArtifactRangeInvalid_base.to`

***

<a id="artifactstorageerror"></a>

### ArtifactStorageError

Artifact persistence or CRDT processing failed.

#### Extends

- `ArtifactStorageError_base`

#### Constructors

<a id="constructor-6"></a>

##### Constructor

> **new ArtifactStorageError**(...`args`): [`ArtifactStorageError`](#artifactstorageerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ArtifactStorageError`](#artifactstorageerror)

###### Inherited from

`ArtifactStorageError_base.constructor`

#### Properties

<a id="artifact-5"></a>

##### artifact

> `readonly` **artifact**: `string`

###### Inherited from

`ArtifactStorageError_base.artifact`

<a id="hint-5"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ArtifactStorageError_base.hint`

<a id="operation"></a>

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ArtifactStorageError_base.operation`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`ArtifactStorageError_base.reason`

***

<a id="artifactsubscriberlagged"></a>

### ArtifactSubscriberLagged

A bounded artifact subscriber could not keep up with committed updates.

#### Extends

- `ArtifactSubscriberLagged_base`

#### Constructors

<a id="constructor-7"></a>

##### Constructor

> **new ArtifactSubscriberLagged**(...`args`): [`ArtifactSubscriberLagged`](#artifactsubscriberlagged)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ArtifactSubscriberLagged`](#artifactsubscriberlagged)

###### Inherited from

`ArtifactSubscriberLagged_base.constructor`

#### Properties

<a id="artifact-6"></a>

##### artifact

> `readonly` **artifact**: `string`

###### Inherited from

`ArtifactSubscriberLagged_base.artifact`

<a id="branch"></a>

##### branch?

> `readonly` `optional` **branch?**: `string`

###### Inherited from

`ArtifactSubscriberLagged_base.branch`

<a id="hint-6"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ArtifactSubscriberLagged_base.hint`

<a id="lastdeliveredversion"></a>

##### lastDeliveredVersion

> `readonly` **lastDeliveredVersion**: `number`

###### Inherited from

`ArtifactSubscriberLagged_base.lastDeliveredVersion`

***

<a id="artifactversionconflict"></a>

### ArtifactVersionConflict

The artifact head changed before an operation-log append committed.

#### Extends

- `ArtifactVersionConflict_base`

#### Constructors

<a id="constructor-8"></a>

##### Constructor

> **new ArtifactVersionConflict**(...`args`): [`ArtifactVersionConflict`](#artifactversionconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ArtifactVersionConflict`](#artifactversionconflict)

###### Inherited from

`ArtifactVersionConflict_base.constructor`

#### Properties

<a id="actual-1"></a>

##### actual

> `readonly` **actual**: `number`

###### Inherited from

`ArtifactVersionConflict_base.actual`

<a id="artifact-7"></a>

##### artifact

> `readonly` **artifact**: `string`

###### Inherited from

`ArtifactVersionConflict_base.artifact`

<a id="branch-1"></a>

##### branch?

> `readonly` `optional` **branch?**: `string`

###### Inherited from

`ArtifactVersionConflict_base.branch`

<a id="expected-2"></a>

##### expected

> `readonly` **expected**: `number`

###### Inherited from

`ArtifactVersionConflict_base.expected`

<a id="hint-7"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ArtifactVersionConflict_base.hint`

***

<a id="artifactversionnotfound"></a>

### ArtifactVersionNotFound

A requested historical version does not exist on the selected artifact branch.

#### Extends

- `ArtifactVersionNotFound_base`

#### Constructors

<a id="constructor-9"></a>

##### Constructor

> **new ArtifactVersionNotFound**(...`args`): [`ArtifactVersionNotFound`](#artifactversionnotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ArtifactVersionNotFound`](#artifactversionnotfound)

###### Inherited from

`ArtifactVersionNotFound_base.constructor`

#### Properties

<a id="artifact-8"></a>

##### artifact

> `readonly` **artifact**: `string`

###### Inherited from

`ArtifactVersionNotFound_base.artifact`

<a id="branch-2"></a>

##### branch?

> `readonly` `optional` **branch?**: `string`

###### Inherited from

`ArtifactVersionNotFound_base.branch`

<a id="hint-8"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ArtifactVersionNotFound_base.hint`

<a id="version"></a>

##### version

> `readonly` **version**: `number`

###### Inherited from

`ArtifactVersionNotFound_base.version`

## Interfaces

<a id="crdtservice"></a>

### CrdtService

**`Experimental`**

Text CRDT boundary implemented first by the optional Yjs peer.

#### Properties

<a id="apply"></a>

##### apply

> `readonly` **apply**: (`snapshot`, `update`) => `Effect`\<`Uint8Array`\<`ArrayBufferLike`\>, [`ArtifactStorageError`](#artifactstorageerror)\>

**`Experimental`**

###### Parameters

###### snapshot

`Uint8Array`

###### update

`Uint8Array`

###### Returns

`Effect`\<`Uint8Array`\<`ArrayBufferLike`\>, [`ArtifactStorageError`](#artifactstorageerror)\>

<a id="edit"></a>

##### edit

> `readonly` **edit**: (`input`) => `Effect`\<`CrdtEdit`, [`ArtifactRangeInvalid`](#artifactrangeinvalid) \| [`ArtifactStorageError`](#artifactstorageerror)\>

**`Experimental`**

###### Parameters

###### input

###### artifact

`string`

###### base

`Uint8Array`

###### current

`Uint8Array`

###### operation

\{ `at`: `number`; `text`: `string`; \} \| \{ `from`: `number`; `to`: `number`; \} \| \{ `from`: `number`; `text`: `string`; `to`: `number`; \}

###### Returns

`Effect`\<`CrdtEdit`, [`ArtifactRangeInvalid`](#artifactrangeinvalid) \| [`ArtifactStorageError`](#artifactstorageerror)\>

<a id="empty"></a>

##### empty

> `readonly` **empty**: (`initial`) => `Effect`\<`Uint8Array`\<`ArrayBufferLike`\>, [`ArtifactStorageError`](#artifactstorageerror)\>

**`Experimental`**

###### Parameters

###### initial

`string`

###### Returns

`Effect`\<`Uint8Array`\<`ArrayBufferLike`\>, [`ArtifactStorageError`](#artifactstorageerror)\>

<a id="id"></a>

##### id

> `readonly` **id**: `string`

**`Experimental`**

<a id="read"></a>

##### read

> `readonly` **read**: (`snapshot`) => `Effect`\<`string`, [`ArtifactStorageError`](#artifactstorageerror)\>

**`Experimental`**

###### Parameters

###### snapshot

`Uint8Array`

###### Returns

`Effect`\<`string`, [`ArtifactStorageError`](#artifactstorageerror)\>

***

<a id="document"></a>

### Document

#### Properties

<a id="edittool"></a>

##### editTool

> `readonly` **editTool**: [`EditTool`](#edittool-1)

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="read-1"></a>

##### read

> `readonly` **read**: `Effect`\<\{ `artifact`: `string`; `branch?`: `string`; `content`: `string`; `version`: `number`; \}, [`ArtifactAlreadyOpen`](#artifactalreadyopen) \| [`ArtifactBaseStale`](#artifactbasestale) \| [`ArtifactCrdtMismatch`](#artifactcrdtmismatch) \| [`ArtifactNotFound`](#artifactnotfound) \| [`ArtifactRangeInvalid`](#artifactrangeinvalid) \| [`ArtifactStorageError`](#artifactstorageerror) \| [`ArtifactSubscriberLagged`](#artifactsubscriberlagged) \| [`ArtifactVersionConflict`](#artifactversionconflict) \| [`ArtifactVersionNotFound`](#artifactversionnotfound)\>

<a id="readtool"></a>

##### readTool

> `readonly` **readTool**: [`ReadTool`](#readtool-1)

***

<a id="openoptions"></a>

### OpenOptions

**`Experimental`**

Configuration for opening one shared text artifact.

#### Type Parameters

##### Error

`Error`

##### Requirements

`Requirements`

#### Properties

<a id="crdt"></a>

##### crdt

> `readonly` **crdt**: `Layer`\<[`ArtifactCrdt`](#artifactcrdt), `Error`, `Requirements`\>

**`Experimental`**

<a id="initial"></a>

##### initial?

> `readonly` `optional` **initial?**: `string`

**`Experimental`**

## Type Aliases

<a id="agentattribution"></a>

### AgentAttribution

> **AgentAttribution** = *typeof* `AgentAttribution.Type`

**`Experimental`**

Identity recorded for an Agent-authored artifact operation.

***

<a id="artifacterror"></a>

### ArtifactError

> **ArtifactError** = *typeof* `ArtifactError.Type`

**`Experimental`**

Failures exposed by shared artifact operations.

***

<a id="artifactupdate"></a>

### ArtifactUpdate

> **ArtifactUpdate** = *typeof* `ArtifactUpdate.Type`

**`Experimental`**

Full operation-log entry delivered to CRDT peers.

***

<a id="attribution"></a>

### Attribution

> **Attribution** = *typeof* `Attribution.Type`

**`Experimental`**

Authorship retained with every shared artifact operation.

***

<a id="editresult"></a>

### EditResult

> **EditResult** = *typeof* `EditResult.Type`

**`Experimental`**

Journaled result of one attributed artifact edit.

***

<a id="edittool-1"></a>

### EditTool

> **EditTool** = `Tool.Tool`\<`` `artifact_edit_${string}` ``, \{ `failure`: *typeof* [`ArtifactError`](#artifacterror-1); `failureMode`: `"return"`; `parameters`: *typeof* `EditParameters`; `success`: *typeof* [`EditResult`](#editresult-2); \}, [`DriverInterpreter`](./generalist/namespaces/DurableDriver#driverinterpreter) \| [`ToolContext`](./generalist/namespaces/ToolContext#toolcontext)\> & `ManagedArtifactTool`

**`Experimental`**

Model-facing exact-base text edit tool.

***

<a id="humanattribution"></a>

### HumanAttribution

> **HumanAttribution** = *typeof* `HumanAttribution.Type`

**`Experimental`**

Identity recorded for a human-authored artifact operation.

***

<a id="rangeoperation"></a>

### RangeOperation

> **RangeOperation** = *typeof* `RangeOperation.Type`

**`Experimental`**

One text operation whose coordinates refer to the declared base version.

***

<a id="readresult"></a>

### ReadResult

> **ReadResult** = *typeof* `ReadResult.Type`

**`Experimental`**

Model-visible artifact contents and the exact version read.

***

<a id="readtool-1"></a>

### ReadTool

> **ReadTool** = `Tool.Tool`\<`` `artifact_read_${string}` ``, \{ `failure`: *typeof* [`ArtifactError`](#artifacterror-1); `failureMode`: `"return"`; `parameters`: *typeof* `ReadParameters`; `success`: *typeof* [`ReadResult`](#readresult-2); \}, [`DriverInterpreter`](./generalist/namespaces/DurableDriver#driverinterpreter) \| [`ToolContext`](./generalist/namespaces/ToolContext#toolcontext)\> & `ManagedArtifactTool`

**`Experimental`**

Model-facing tool that journals one exact artifact version read.

***

<a id="version-1"></a>

### Version

> **Version** = *typeof* `Version.Type`

**`Experimental`**

Monotonic operation position within one artifact branch.

## Variables

<a id="agentattribution-1"></a>

### AgentAttribution

> `const` **AgentAttribution**: `Schema.TaggedStruct`\<`"Agent"`, \{ `actor`: `Schema.String`; `runId`: `Schema.String`; \}\>

**`Experimental`**

Identity recorded for an Agent-authored artifact operation.

***

<a id="artifact-9"></a>

### Artifact

> `const` **Artifact**: `object`

**`Experimental`**

Unstable shared Artifact API.

#### Type Declaration

<a id="artifactcrdt-1"></a>

##### ArtifactCrdt

> `readonly` **ArtifactCrdt**: *typeof* [`ArtifactCrdt`](#artifactcrdt)

<a id="artifactupdate-1"></a>

##### ArtifactUpdate

> `readonly` **ArtifactUpdate**: `Schema.Struct`\<\{ `artifact`: `Schema.String`; `attribution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Agent"`, \{ `actor`: `Schema.String`; `runId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Human"`, \{ `actor`: `Schema.String`; \}\>\]\>; `base`: `Schema.Int`; `branch`: `Schema.optionalKey`\<`Schema.String`\>; `operation`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Insert"`, \{ `at`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `from`: `Schema.Int`; `to`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"Replace"`, \{ `from`: `Schema.Int`; `text`: `Schema.String`; `to`: `Schema.Int`; \}\>\]\>; `result`: `Schema.Int`; `snapshot`: `Schema.Struct`\<\{ `bytes`: `Schema.Int`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; `sha256`: `Schema.String`; \}\>; `update`: `Schema.Uint8ArrayFromBase64`; \}\>

<a id="editresult-1"></a>

##### EditResult

> `readonly` **EditResult**: `Schema.Struct`\<\{ `artifact`: `Schema.String`; `attribution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Agent"`, \{ `actor`: `Schema.String`; `runId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Human"`, \{ `actor`: `Schema.String`; \}\>\]\>; `base`: `Schema.Int`; `branch`: `Schema.optionalKey`\<`Schema.String`\>; `result`: `Schema.Int`; \}\>

<a id="layer"></a>

##### layer

> `readonly` **layer**: `Layer.Layer`\<`ArtifactRegistry`, `never`, `never`\>

<a id="open"></a>

##### open

> `readonly` **open**: \{\<`Error`, `Requirements`\>(`options`): (`name`) => `OpenEffect`\<`Error`, `Requirements`\>; \<`Error`, `Requirements`\>(`name`, `options`): `OpenEffect`\<`Error`, `Requirements`\>; \}

###### Call Signature

> \<`Error`, `Requirements`\>(`options`): (`name`) => `OpenEffect`\<`Error`, `Requirements`\>

###### Type Parameters

###### Error

`Error`

###### Requirements

`Requirements`

###### Parameters

###### options

[`OpenOptions`](#openoptions)\<`Error`, `Requirements`\>

###### Returns

(`name`) => `OpenEffect`\<`Error`, `Requirements`\>

###### Call Signature

> \<`Error`, `Requirements`\>(`name`, `options`): `OpenEffect`\<`Error`, `Requirements`\>

###### Type Parameters

###### Error

`Error`

###### Requirements

`Requirements`

###### Parameters

###### name

`string`

###### options

[`OpenOptions`](#openoptions)\<`Error`, `Requirements`\>

###### Returns

`OpenEffect`\<`Error`, `Requirements`\>

<a id="rangeoperation-1"></a>

##### RangeOperation

> `readonly` **RangeOperation**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Insert"`, \{ `at`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `from`: `Schema.Int`; `to`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"Replace"`, \{ `from`: `Schema.Int`; `text`: `Schema.String`; `to`: `Schema.Int`; \}\>\]\>

<a id="read-2"></a>

##### read

> `readonly` **read**: *typeof* [`read`](#read-3)

<a id="readresult-1"></a>

##### ReadResult

> `readonly` **ReadResult**: `Schema.Struct`\<\{ `artifact`: `Schema.String`; `branch`: `Schema.optionalKey`\<`Schema.String`\>; `content`: `Schema.String`; `version`: `Schema.Int`; \}\>

<a id="readtool-2"></a>

##### readTool

> `readonly` **readTool**: *typeof* [`readTool`](#readtool-3)

<a id="tool"></a>

##### tool

> `readonly` **tool**: *typeof* [`tool`](#tool-1)

<a id="version-2"></a>

##### Version

> `readonly` **Version**: `Schema.Int`

***

<a id="artifacterror-1"></a>

### ArtifactError

> `const` **ArtifactError**: `Schema.Union`\<readonly \[*typeof* [`ArtifactNotFound`](#artifactnotfound), *typeof* [`ArtifactVersionNotFound`](#artifactversionnotfound), *typeof* [`ArtifactVersionConflict`](#artifactversionconflict), *typeof* [`ArtifactBaseStale`](#artifactbasestale), *typeof* [`ArtifactRangeInvalid`](#artifactrangeinvalid), *typeof* [`ArtifactCrdtMismatch`](#artifactcrdtmismatch), *typeof* [`ArtifactAlreadyOpen`](#artifactalreadyopen), *typeof* [`ArtifactStorageError`](#artifactstorageerror), *typeof* [`ArtifactSubscriberLagged`](#artifactsubscriberlagged)\]\>

**`Experimental`**

Failures exposed by shared artifact operations.

***

<a id="artifactupdate-2"></a>

### ArtifactUpdate

> `const` **ArtifactUpdate**: `Schema.Struct`\<\{ `artifact`: `Schema.String`; `attribution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Agent"`, \{ `actor`: `Schema.String`; `runId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Human"`, \{ `actor`: `Schema.String`; \}\>\]\>; `base`: `Schema.Int`; `branch`: `Schema.optionalKey`\<`Schema.String`\>; `operation`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Insert"`, \{ `at`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `from`: `Schema.Int`; `to`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"Replace"`, \{ `from`: `Schema.Int`; `text`: `Schema.String`; `to`: `Schema.Int`; \}\>\]\>; `result`: `Schema.Int`; `snapshot`: `Schema.Struct`\<\{ `bytes`: `Schema.Int`; `filename`: `Schema.optionalKey`\<`Schema.String`\>; `mediaType`: `Schema.String`; `sha256`: `Schema.String`; \}\>; `update`: `Schema.Uint8ArrayFromBase64`; \}\>

**`Experimental`**

Full operation-log entry delivered to CRDT peers.

***

<a id="attribution-1"></a>

### Attribution

> `const` **Attribution**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Agent"`, \{ `actor`: `Schema.String`; `runId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Human"`, \{ `actor`: `Schema.String`; \}\>\]\>

**`Experimental`**

Authorship retained with every shared artifact operation.

***

<a id="editresult-2"></a>

### EditResult

> `const` **EditResult**: `Schema.Struct`\<\{ `artifact`: `Schema.String`; `attribution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Agent"`, \{ `actor`: `Schema.String`; `runId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Human"`, \{ `actor`: `Schema.String`; \}\>\]\>; `base`: `Schema.Int`; `branch`: `Schema.optionalKey`\<`Schema.String`\>; `result`: `Schema.Int`; \}\>

**`Experimental`**

Journaled result of one attributed artifact edit.

***

<a id="humanattribution-1"></a>

### HumanAttribution

> `const` **HumanAttribution**: `Schema.TaggedStruct`\<`"Human"`, \{ `actor`: `Schema.String`; \}\>

**`Experimental`**

Identity recorded for a human-authored artifact operation.

***

<a id="layer-1"></a>

### layer

> `const` **layer**: `Layer.Layer`\<`ArtifactRegistry`\>

**`Experimental`**

Process-scoped registry for open Artifact documents and their model tool handlers.

***

<a id="open-1"></a>

### open

> `const` **open**: \{\<`Error`, `Requirements`\>(`options`): (`name`) => `OpenEffect`\<`Error`, `Requirements`\>; \<`Error`, `Requirements`\>(`name`, `options`): `OpenEffect`\<`Error`, `Requirements`\>; \}

**`Experimental`**

Open and register one shared text artifact, creating its main snapshot when absent.

#### Call Signature

> \<`Error`, `Requirements`\>(`options`): (`name`) => `OpenEffect`\<`Error`, `Requirements`\>

##### Type Parameters

###### Error

`Error`

###### Requirements

`Requirements`

##### Parameters

###### options

[`OpenOptions`](#openoptions)\<`Error`, `Requirements`\>

##### Returns

(`name`) => `OpenEffect`\<`Error`, `Requirements`\>

#### Call Signature

> \<`Error`, `Requirements`\>(`name`, `options`): `OpenEffect`\<`Error`, `Requirements`\>

##### Type Parameters

###### Error

`Error`

###### Requirements

`Requirements`

##### Parameters

###### name

`string`

###### options

[`OpenOptions`](#openoptions)\<`Error`, `Requirements`\>

##### Returns

`OpenEffect`\<`Error`, `Requirements`\>

***

<a id="rangeoperation-2"></a>

### RangeOperation

> `const` **RangeOperation**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Insert"`, \{ `at`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `from`: `Schema.Int`; `to`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"Replace"`, \{ `from`: `Schema.Int`; `text`: `Schema.String`; `to`: `Schema.Int`; \}\>\]\>

**`Experimental`**

One text operation whose coordinates refer to the declared base version.

***

<a id="read-3"></a>

### read

> `const` **read**: (`document`) => [`Document`](#document)\[`"read"`\]

**`Experimental`**

Read an open document's current main branch.

#### Parameters

##### document

[`Document`](#document)

#### Returns

[`Document`](#document)\[`"read"`\]

***

<a id="readresult-2"></a>

### ReadResult

> `const` **ReadResult**: `Schema.Struct`\<\{ `artifact`: `Schema.String`; `branch`: `Schema.optionalKey`\<`Schema.String`\>; `content`: `Schema.String`; `version`: `Schema.Int`; \}\>

**`Experimental`**

Model-visible artifact contents and the exact version read.

***

<a id="readtool-3"></a>

### readTool

> `const` **readTool**: (`document`) => [`Document`](#document)\[`"readTool"`\]

**`Experimental`**

Model-facing versioned read tool for an open document.

#### Parameters

##### document

[`Document`](#document)

#### Returns

[`Document`](#document)\[`"readTool"`\]

***

<a id="tool-1"></a>

### tool

> `const` **tool**: (`document`) => [`Document`](#document)\[`"editTool"`\]

**`Experimental`**

Model-facing range edit tool for an open document.

#### Parameters

##### document

[`Document`](#document)

#### Returns

[`Document`](#document)\[`"editTool"`\]

***

<a id="version-3"></a>

### Version

> `const` **Version**: `Schema.Int`

**`Experimental`**

Monotonic operation position within one artifact branch.

***

<a id="yjs"></a>

### Yjs

> `const` **Yjs**: `object`

**`Experimental`**

Yjs Artifact integration.

#### Type Declaration

<a id="layer-2"></a>

##### layer

> `readonly` **layer**: *typeof* `layer`
