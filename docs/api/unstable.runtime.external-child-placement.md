[**generalist**](./index)

***

[generalist](./index) / unstable.runtime.external-child-placement

# unstable.runtime.external-child-placement

## Classes

### ExternalChildCapacityUnavailable

No child slot is available; reservation made no mutation.

#### Extends

- `ExternalChildCapacityUnavailable_base`

#### Constructors

##### Constructor

> **new ExternalChildCapacityUnavailable**(...`args`): [`ExternalChildCapacityUnavailable`](#externalchildcapacityunavailable)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExternalChildCapacityUnavailable`](#externalchildcapacityunavailable)

###### Inherited from

`ExternalChildCapacityUnavailable_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalChildCapacityUnavailable_base.hint`

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`ExternalChildCapacityUnavailable_base.limit`

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`ExternalChildCapacityUnavailable_base.parentRunId`

***

### ExternalChildPlacementConflict

A placement id was replayed with different immutable facts.

#### Extends

- `ExternalChildPlacementConflict_base`

#### Constructors

##### Constructor

> **new ExternalChildPlacementConflict**(...`args`): [`ExternalChildPlacementConflict`](#externalchildplacementconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExternalChildPlacementConflict`](#externalchildplacementconflict)

###### Inherited from

`ExternalChildPlacementConflict_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalChildPlacementConflict_base.hint`

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalChildPlacementConflict_base.placementId`

***

### ExternalChildPlacementNotFound

No external placement has this id.

#### Extends

- `ExternalChildPlacementNotFound_base`

#### Constructors

##### Constructor

> **new ExternalChildPlacementNotFound**(...`args`): [`ExternalChildPlacementNotFound`](#externalchildplacementnotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExternalChildPlacementNotFound`](#externalchildplacementnotfound)

###### Inherited from

`ExternalChildPlacementNotFound_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalChildPlacementNotFound_base.hint`

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalChildPlacementNotFound_base.placementId`

***

### ExternalChildSettlementConflict

A settlement identity was replayed with a different outcome.

#### Extends

- `ExternalChildSettlementConflict_base`

#### Constructors

##### Constructor

> **new ExternalChildSettlementConflict**(...`args`): [`ExternalChildSettlementConflict`](#externalchildsettlementconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExternalChildSettlementConflict`](#externalchildsettlementconflict)

###### Inherited from

`ExternalChildSettlementConflict_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalChildSettlementConflict_base.hint`

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalChildSettlementConflict_base.placementId`

##### settlementId

> `readonly` **settlementId**: `string`

###### Inherited from

`ExternalChildSettlementConflict_base.settlementId`

***

### ExternalRootConflict

An external root identity was replayed with different immutable facts.

#### Extends

- `ExternalRootConflict_base`

#### Constructors

##### Constructor

> **new ExternalRootConflict**(...`args`): [`ExternalRootConflict`](#externalrootconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExternalRootConflict`](#externalrootconflict)

###### Inherited from

`ExternalRootConflict_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalRootConflict_base.hint`

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalRootConflict_base.placementId`

***

### ExternalRootExecutableMismatch

The supplied digest does not identify the root executable.

#### Extends

- `ExternalRootExecutableMismatch_base`

#### Constructors

##### Constructor

> **new ExternalRootExecutableMismatch**(...`args`): [`ExternalRootExecutableMismatch`](#externalrootexecutablemismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExternalRootExecutableMismatch`](#externalrootexecutablemismatch)

###### Inherited from

`ExternalRootExecutableMismatch_base.constructor`

#### Properties

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`ExternalRootExecutableMismatch_base.actual`

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`ExternalRootExecutableMismatch_base.expected`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalRootExecutableMismatch_base.hint`

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalRootExecutableMismatch_base.placementId`

***

### ExternalRootNotFound

No locally owned external root has this placement id.

#### Extends

- `ExternalRootNotFound_base`

#### Constructors

##### Constructor

> **new ExternalRootNotFound**(...`args`): [`ExternalRootNotFound`](#externalrootnotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExternalRootNotFound`](#externalrootnotfound)

###### Inherited from

`ExternalRootNotFound_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalRootNotFound_base.hint`

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalRootNotFound_base.placementId`

## Type Aliases

### ExternalRoot

> **ExternalRoot** = *typeof* `ExternalRoot.Type`

A depth-zero child root owned by this partition.

***

### ExternalRootSettlement

> **ExternalRootSettlement** = *typeof* `ExternalRootSettlement.Type`

Durable terminal delivery replayed until the parent acknowledges it.

***

### ExternalRunRef

> **ExternalRunRef** = *typeof* `ExternalRunRef.Type`

A Run address owned by an external partition.

***

### ParentSuspension

> **ParentSuspension** = *typeof* `ParentSuspension.Type`

Optional parent suspension committed atomically with external placement.

***

### Placement

> **Placement** = *typeof* `Placement.Type`

Stored placement state returned by every placement operation.

***

### ReserveInput

> **ReserveInput** = *typeof* `ReserveInput.Type`

Immutable admission facts plus current parent claim authority.

## Variables

### executableDigest

> `const` **executableDigest**: (`executable`) => `string`

Stable digest of the exact executable admitted on the child partition.

#### Parameters

##### executable

[`PinnedExecutable`](./runtime/namespaces/ExecutableManifest#pinnedexecutable)

#### Returns

`string`

***

### ExternalRoot

> `const` **ExternalRoot**: `Schema.Struct`\<\{ `activated`: `Schema.Boolean`; `admissionDigest`: `Schema.String`; `cancelRequested`: `Schema.Boolean`; `executableDigest`: `Schema.String`; `outcome`: `Schema.optionalKey`\<`Schema.Codec`\<[`RunOutcome`](./runtime/namespaces/Run#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: \{ `output?`: `unknown`; `session`: \{ `leafId`: `string` \| `null`; `sessionId`: `string`; \}; `text`: `string`; `turns`: `number`; \} \| \{ `_tag`: `"Program"`; `value`: `unknown`; \}; \} \| \{ `_tag`: `"Failed"`; `error`: `unknown`; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>\>; `parent`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `placementId`: `Schema.String`; `ref`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `requestDigest`: `Schema.String`; `sessionId`: `Schema.String`; `settlementAcknowledged`: `Schema.Boolean`; \}\>

A depth-zero child root owned by this partition.

***

### ExternalRootSettlement

> `const` **ExternalRootSettlement**: `Schema.Struct`\<\{ `acknowledged`: `Schema.Boolean`; `outcome`: `Schema.Codec`\<[`RunOutcome`](./runtime/namespaces/Run#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: \{ `output?`: `unknown`; `session`: \{ `leafId`: `string` \| `null`; `sessionId`: `string`; \}; `text`: `string`; `turns`: `number`; \} \| \{ `_tag`: `"Program"`; `value`: `unknown`; \}; \} \| \{ `_tag`: `"Failed"`; `error`: `unknown`; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>; `placementId`: `Schema.String`; `ref`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `settlementId`: `Schema.String`; \}\>

Durable terminal delivery replayed until the parent acknowledges it.

***

### ExternalRunRef

> `const` **ExternalRunRef**: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>

A Run address owned by an external partition.

***

### ParentSuspension

> `const` **ParentSuspension**: `Schema.Struct`\<\{ `checkpoint`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<...\>; `remaining`: `Schema.Struct`\<...\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: ...; `executable`: ...; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Program"`, \{ `version`: `Schema.Literal`\<`"1"`\>; \}\>\]\>\>; `continuation`: `Schema.optionalKey`\<`Schema.NullOr`\<`Schema.Struct`\<\{ `nextTurn`: `Schema.Int`; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `queue`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>\>; `schemaVersion`: `Schema.Literal`\<`1`\>; `steeringEntryIds`: `Schema.$Array`\<`Schema.String`\>; \}\>\>\>; `suspension`: `Schema.Codec`\<[`ExecutionSuspension`](./runtime/namespaces/ExecutionState#executionsuspension), `unknown`, `never`, `never`\>; `wait`: `Schema.Struct`\<\{ `closedAt`: `Schema.optionalKey`\<`Schema.String`\>; `openedAt`: `Schema.String`; `reason`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"ToolWait"`, \{ \}\>, `Schema.TaggedStruct`\<`"Approval"`, \{ `request`: `Schema.Struct`\<\{ `approvalId`: ...; `capability`: ...; `input`: ...; `operation`: ...; \}\>; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Timer"`, \{ `dueAt`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"External"`, \{ `capability`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"AwaitEvent"`, \{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly ...\>; \}\>\]\>; `resolution`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<...\>; \}\>, `Schema.TaggedStruct`\<`"ToolResult"`, \{ `encodedResult`: `Schema.Unknown`; `result`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; `payload`: `Schema.optionalKey`\<...\>; \}\>\]\>\>; `status`: `Schema.Literals`\<readonly \[`"open"`, `"responded"`, `"signaled"`, `"cancelled"`\]\>; `waitId`: `Schema.String`; \}\>; \}\>

Optional parent suspension committed atomically with external placement.

***

### Placement

> `const` **Placement**: `Schema.Struct`\<\{ `acknowledged`: `Schema.Boolean`; `cancelRequested`: `Schema.Boolean`; `executableDigest`: `Schema.String`; `invocationId`: `Schema.String`; `outcome`: `Schema.optionalKey`\<`Schema.Codec`\<[`RunOutcome`](./runtime/namespaces/Run#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: \{ `output?`: `unknown`; `session`: \{ `leafId`: `string` \| `null`; `sessionId`: `string`; \}; `text`: `string`; `turns`: `number`; \} \| \{ `_tag`: `"Program"`; `value`: `unknown`; \}; \} \| \{ `_tag`: `"Failed"`; `error`: `unknown`; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>\>; `parentRunId`: `Schema.String`; `placementId`: `Schema.String`; `ref`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `requestDigest`: `Schema.String`; `settled`: `Schema.Boolean`; `settlementId`: `Schema.optionalKey`\<`Schema.String`\>; `suspensionIdentity`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

Stored placement state returned by every placement operation.

***

### ReserveInput

> `const` **ReserveInput**: `Schema.Struct`\<\{ `attemptFence`: `Schema.Int`; `executableDigest`: `Schema.String`; `invocationId`: `Schema.String`; `ownerId`: `Schema.String`; `parentSuspension`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `checkpoint`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `budget`: ...; `driverVersion`: ...; `executable`: ...; `state`: ...; `turn`: ...; \}\>, `Schema.TaggedStruct`\<`"Program"`, \{ `version`: ...; \}\>\]\>\>; `continuation`: `Schema.optionalKey`\<`Schema.NullOr`\<`Schema.Struct`\<\{ `nextTurn`: `Schema.Int`; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `queue`: `Schema.optionalKey`\<`Schema.Literals`\<...\>\>; `schemaVersion`: `Schema.Literal`\<`1`\>; `steeringEntryIds`: `Schema.$Array`\<`Schema.String`\>; \}\>\>\>; `suspension`: `Schema.Codec`\<[`ExecutionSuspension`](./runtime/namespaces/ExecutionState#executionsuspension), `unknown`, `never`, `never`\>; `wait`: `Schema.Struct`\<\{ `closedAt`: `Schema.optionalKey`\<`Schema.String`\>; `openedAt`: `Schema.String`; `reason`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>\]\>; `resolution`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[..., ..., ..., ...\]\>\>; `status`: `Schema.Literals`\<readonly \[`"open"`, `"responded"`, `"signaled"`, `"cancelled"`\]\>; `waitId`: `Schema.String`; \}\>; \}\>\>; `placementId`: `Schema.String`; `ref`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `requestDigest`: `Schema.String`; `runId`: `Schema.String`; `session`: `Schema.Struct`\<\{ `epoch`: `Schema.String`; `ownerId`: `Schema.String`; `runAttemptFence`: `Schema.Finite`; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>

Immutable admission facts plus current parent claim authority.

***

### suspensionIdentity

> `const` **suspensionIdentity**: (`input`) => `string`

Stable identity of an optional parent wait/suspension closure.

#### Parameters

##### input

[`ParentSuspension`](#parentsuspension)

#### Returns

`string`
