[**generalist**](./index.md)

***

[generalist](./index.md) / unstable.runtime.external-child-placement

# unstable.runtime.external-child-placement

## Classes

<a id="externalchildcapacityunavailable"></a>

### ExternalChildCapacityUnavailable

No child slot is available; reservation made no mutation.

#### Extends

- `ExternalChildCapacityUnavailable_base`

#### Constructors

<a id="constructor"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalChildCapacityUnavailable_base.hint`

<a id="limit"></a>

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`ExternalChildCapacityUnavailable_base.limit`

<a id="parentrunid"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`ExternalChildCapacityUnavailable_base.parentRunId`

***

<a id="externalchildplacementconflict"></a>

### ExternalChildPlacementConflict

A placement id was replayed with different immutable facts.

#### Extends

- `ExternalChildPlacementConflict_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalChildPlacementConflict_base.hint`

<a id="placementid"></a>

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalChildPlacementConflict_base.placementId`

***

<a id="externalchildplacementnotfound"></a>

### ExternalChildPlacementNotFound

No external placement has this id.

#### Extends

- `ExternalChildPlacementNotFound_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalChildPlacementNotFound_base.hint`

<a id="placementid-1"></a>

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalChildPlacementNotFound_base.placementId`

***

<a id="externalchildsettlementconflict"></a>

### ExternalChildSettlementConflict

A settlement identity was replayed with a different outcome.

#### Extends

- `ExternalChildSettlementConflict_base`

#### Constructors

<a id="constructor-3"></a>

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

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalChildSettlementConflict_base.hint`

<a id="placementid-2"></a>

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalChildSettlementConflict_base.placementId`

<a id="settlementid"></a>

##### settlementId

> `readonly` **settlementId**: `string`

###### Inherited from

`ExternalChildSettlementConflict_base.settlementId`

***

<a id="externalrootconflict"></a>

### ExternalRootConflict

An external root identity was replayed with different immutable facts.

#### Extends

- `ExternalRootConflict_base`

#### Constructors

<a id="constructor-4"></a>

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

<a id="hint-4"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalRootConflict_base.hint`

<a id="placementid-3"></a>

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalRootConflict_base.placementId`

***

<a id="externalrootexecutablemismatch"></a>

### ExternalRootExecutableMismatch

The supplied digest does not identify the root executable.

#### Extends

- `ExternalRootExecutableMismatch_base`

#### Constructors

<a id="constructor-5"></a>

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

<a id="actual"></a>

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`ExternalRootExecutableMismatch_base.actual`

<a id="expected"></a>

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`ExternalRootExecutableMismatch_base.expected`

<a id="hint-5"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalRootExecutableMismatch_base.hint`

<a id="placementid-4"></a>

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalRootExecutableMismatch_base.placementId`

***

<a id="externalrootnotfound"></a>

### ExternalRootNotFound

No locally owned external root has this placement id.

#### Extends

- `ExternalRootNotFound_base`

#### Constructors

<a id="constructor-6"></a>

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

<a id="hint-6"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExternalRootNotFound_base.hint`

<a id="placementid-5"></a>

##### placementId

> `readonly` **placementId**: `string`

###### Inherited from

`ExternalRootNotFound_base.placementId`

## Type Aliases

<a id="admissionrequest"></a>

### AdmissionRequest

> **AdmissionRequest** = *typeof* `AdmissionRequest.Type`

**`Experimental`**

Immutable, serializable admission authority retained before any receiver dispatch.

***

<a id="externalroot"></a>

### ExternalRoot

> **ExternalRoot** = *typeof* `ExternalRoot.Type`

A depth-zero child root owned by this partition.

***

<a id="externalrootsettlement"></a>

### ExternalRootSettlement

> **ExternalRootSettlement** = *typeof* `ExternalRootSettlement.Type`

Durable terminal delivery replayed until the parent acknowledges it.

***

<a id="externalrunref"></a>

### ExternalRunRef

> **ExternalRunRef** = *typeof* `ExternalRunRef.Type`

A Run address owned by an external partition.

***

<a id="pageinput"></a>

### PageInput

> **PageInput** = *typeof* `PageInput.Type`

**`Experimental`**

Bounded immutable-key enumeration; restart each recovery sweep from the beginning.

***

<a id="parentsuspension"></a>

### ParentSuspension

> **ParentSuspension** = *typeof* `ParentSuspension.Type`

Optional parent suspension committed atomically with external placement.

***

<a id="placement"></a>

### Placement

> **Placement** = *typeof* `Placement.Type`

Stored placement state returned by every placement operation.

***

<a id="reserveinput"></a>

### ReserveInput

> **ReserveInput** = *typeof* `ReserveInput.Type`

Immutable admission facts plus current parent claim authority.

***

<a id="rootadmission"></a>

### RootAdmission

> **RootAdmission** = *typeof* `RootAdmission.Type`

**`Experimental`**

Exact receiver command; its envelope is the same one committed by the parent.

## Variables

<a id="admissionrequest-1"></a>

### AdmissionRequest

> `const` **AdmissionRequest**: `Schema.Struct`\<\{ `parent`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `ref`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `root`: `Schema.Struct`\<\{ `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `executableManifest`: `Schema.Codec`\<[`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest), [`ExecutableManifestEncoded`](./generalist/namespaces/ExecutableManifest.md#executablemanifestencoded), `never`, `never`\>; `executableRef`: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>; `message`: `Schema.Struct`\<\{ `causationId`: `Schema.optionalKey`\<`Schema.String`\>; `correlationId`: `Schema.String`; `from`: `Schema.optionalKey`\<`Schema.brand`\<`Schema.String`, `"Address"`\>\>; `id`: `Schema.String`; `idempotencyKey`: `Schema.String`; `inReplyTo`: `Schema.optionalKey`\<`Schema.String`\>; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `sessionId`: `Schema.String`; `to`: `Schema.brand`\<`Schema.String`, `"Address"`\>; \}\>; `registrations`: `Schema.$Array`\<`Schema.Struct`\<\{ `codec`: `Schema.String`; `payload`: `Schema.Unknown`; `pin`: `Schema.String`; `version`: `Schema.String`; \}\>\>; `treePolicy`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `maxDepth`: `Schema.Int`; `maxSubagents`: `Schema.Int`; \}\>\>; \}\>; \}\>

**`Experimental`**

Immutable, serializable admission authority retained before any receiver dispatch.

***

<a id="executabledigest"></a>

### executableDigest

> `const` **executableDigest**: (`executable`) => `string`

Stable digest of the exact executable admitted on the child partition.

#### Parameters

##### executable

[`PinnedExecutable`](./runtime/namespaces/ExecutableManifest.md#pinnedexecutable)

#### Returns

`string`

***

<a id="externalroot-1"></a>

### ExternalRoot

> `const` **ExternalRoot**: `Schema.Struct`\<\{ `activated`: `Schema.Boolean`; `admissionDigest`: `Schema.String`; `cancelRequested`: `Schema.Boolean`; `executableDigest`: `Schema.String`; `outcome`: `Schema.optionalKey`\<`Schema.Codec`\<[`RunOutcome`](./runtime/namespaces/Run.md#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: \{ `output`: `unknown`; `session`: \{ `leafId`: `string` \| `null`; `sessionId`: `string`; \}; `text`: `string`; `turns`: `number`; \} \| \{ `_tag`: `"Program"`; `value`: `unknown`; \}; \} \| \{ `_tag`: `"Failed"`; `error`: \{ `_tag`: `"generalist/core/SandboxUnavailable"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxSourceInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxInputInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxOutputInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxProtocolViolation"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxDeadlineExceeded"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxCancelled"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxResourceExceeded"`; `hint`: `string`; `limit`: `number`; `resource`: `"cpu"` \| `"output"` \| `"subrequests"`; \} \| \{ `_tag`: `"generalist/core/SandboxGuaranteeUnavailable"`; `guarantee`: `"cpuMillis"` \| `"deadlineMillis"` \| `"filesystem"` \| `"network"` \| `"outputBytes"` \| `"persistence"` \| `"physicalIsolation"` \| `"processes"` \| `"subrequests"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxExecutionFailure"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCapabilityMissing"`; `capability`: `string`; `hint`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCapabilityDenied"`; `capability`: `string`; `hint`: `string`; `operation`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramAuthorizationFailure"`; `capability`: `string`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramSchemaFailure"`; `boundary`: `"agent-input"` \| `"agent-output"` \| `"program-input"` \| `"program-output"` \| `"step-input"` \| `"step-output"` \| `"tool-input"` \| `"tool-output"`; `capability?`: `string`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramToolFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `tool`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramStepFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `step`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramAgentFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `selection`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramBudgetExhausted"`; `dimension`: `"agentRuns"` \| `"concurrency"` \| `"logBytes"` \| `"outputBytes"` \| `"tokens"` \| `"toolCalls"` \| `"wallClockMillis"`; `hint`: `string`; `limit`: `number`; \} \| \{ `_tag`: `"generalist/core/ProgramReplayDivergence"`; `actual`: `string`; `expected`: `string`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramOperationUnknown"`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramSuspended"`; `hint`: `string`; `operation`: `string`; `reason`: `"agent"` \| `"approval"` \| `"step"` \| `"tool-wait"`; `token?`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCancelled"`; `hint`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramHandlerMismatch"`; `hint`: `string`; `kind`: `"agent"` \| `"step"` \| `"tool"`; `name`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramIdentityMismatch"`; `actual`: `string`; `expected`: `string`; `hint`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableIdentityMismatch"`; `actualRef`: \{ `active`: `string`; `executable`: `string`; \}; `expectedRef`: \{ `active`: `string`; `executable`: `string`; \}; `hint`: `string`; `runId`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutablePinMissing"`; `hint`: `string`; `ref`: \{ `active`: `string`; `executable`: `string`; \}; `runId`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableRegistrationInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableRegistrationMissing"`; `hint`: `string`; `pin`: `string`; \} \| \{ `_tag`: `"generalist/runtime/AgentExecutionFailure"`; `cause?`: `Schema.Json`; `failure?`: \{ `_tag`: `"generalist/core/RunBudgetExhausted"`; `budget`: ... \| ... \| ... \| ... \| ...; `hint`: `string`; `remaining?`: `number`; `requested`: `number`; \} \| \{ `_tag`: `"generalist/core/ResumeMismatch"`; `expected?`: ... \| ...; `hint`: `string`; `reason`: ... \| ...; `received`: \{ `_tag`: ...; `checkpoint`: ...; `hint`: ...; `waits`: ...; \}; \} \| \{ `_tag`: `"generalist/core/GateFailed"`; `gate`: \{ `evidence`: ...; `name`: ...; `verdict`: ...; \}; `hint`: `string`; \} \| \{ `_tag`: `"generalist/core/PermissionDenied"`; `hint`: `string`; `message`: `string`; \}; `hint`: `string`; `message`: `string`; \}; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>\>; `parent`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `placementId`: `Schema.String`; `ref`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `requestDigest`: `Schema.String`; `sessionId`: `Schema.String`; `settlementAcknowledged`: `Schema.Boolean`; \}\>

A depth-zero child root owned by this partition.

***

<a id="externalrootsettlement-1"></a>

### ExternalRootSettlement

> `const` **ExternalRootSettlement**: `Schema.Struct`\<\{ `acknowledged`: `Schema.Boolean`; `outcome`: `Schema.Codec`\<[`RunOutcome`](./runtime/namespaces/Run.md#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: \{ `output`: `unknown`; `session`: \{ `leafId`: `string` \| `null`; `sessionId`: `string`; \}; `text`: `string`; `turns`: `number`; \} \| \{ `_tag`: `"Program"`; `value`: `unknown`; \}; \} \| \{ `_tag`: `"Failed"`; `error`: \{ `_tag`: `"generalist/core/SandboxUnavailable"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxSourceInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxInputInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxOutputInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxProtocolViolation"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxDeadlineExceeded"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxCancelled"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxResourceExceeded"`; `hint`: `string`; `limit`: `number`; `resource`: `"cpu"` \| `"output"` \| `"subrequests"`; \} \| \{ `_tag`: `"generalist/core/SandboxGuaranteeUnavailable"`; `guarantee`: `"cpuMillis"` \| `"deadlineMillis"` \| `"filesystem"` \| `"network"` \| `"outputBytes"` \| `"persistence"` \| `"physicalIsolation"` \| `"processes"` \| `"subrequests"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxExecutionFailure"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCapabilityMissing"`; `capability`: `string`; `hint`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCapabilityDenied"`; `capability`: `string`; `hint`: `string`; `operation`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramAuthorizationFailure"`; `capability`: `string`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramSchemaFailure"`; `boundary`: `"agent-input"` \| `"agent-output"` \| `"program-input"` \| `"program-output"` \| `"step-input"` \| `"step-output"` \| `"tool-input"` \| `"tool-output"`; `capability?`: `string`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramToolFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `tool`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramStepFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `step`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramAgentFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `selection`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramBudgetExhausted"`; `dimension`: `"agentRuns"` \| `"concurrency"` \| `"logBytes"` \| `"outputBytes"` \| `"tokens"` \| `"toolCalls"` \| `"wallClockMillis"`; `hint`: `string`; `limit`: `number`; \} \| \{ `_tag`: `"generalist/core/ProgramReplayDivergence"`; `actual`: `string`; `expected`: `string`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramOperationUnknown"`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramSuspended"`; `hint`: `string`; `operation`: `string`; `reason`: `"agent"` \| `"approval"` \| `"step"` \| `"tool-wait"`; `token?`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCancelled"`; `hint`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramHandlerMismatch"`; `hint`: `string`; `kind`: `"agent"` \| `"step"` \| `"tool"`; `name`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramIdentityMismatch"`; `actual`: `string`; `expected`: `string`; `hint`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableIdentityMismatch"`; `actualRef`: \{ `active`: `string`; `executable`: `string`; \}; `expectedRef`: \{ `active`: `string`; `executable`: `string`; \}; `hint`: `string`; `runId`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutablePinMissing"`; `hint`: `string`; `ref`: \{ `active`: `string`; `executable`: `string`; \}; `runId`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableRegistrationInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableRegistrationMissing"`; `hint`: `string`; `pin`: `string`; \} \| \{ `_tag`: `"generalist/runtime/AgentExecutionFailure"`; `cause?`: `Schema.Json`; `failure?`: \{ `_tag`: `"generalist/core/RunBudgetExhausted"`; `budget`: `"children"` \| `"duration"` \| `"tokens"` \| `"toolCalls"` \| `"usd"`; `hint`: `string`; `remaining?`: `number`; `requested`: `number`; \} \| \{ `_tag`: `"generalist/core/ResumeMismatch"`; `expected?`: \{ `_tag`: ...; `checkpoint`: ...; `hint`: ...; `waits`: ...; \}; `hint`: `string`; `reason`: `"checkpoint-not-found"` \| `"identity-mismatch"`; `received`: \{ `_tag`: `"generalist/core/AgentSuspended"`; `checkpoint`: \{ `activatedSkills`: ...; `activeTools`: ...; `argumentTaint?`: ...; `authorizationContextDigest`: ...; `calls`: ...; `invocationPath`: ...; `turn`: ...; \}; `hint`: `string`; `waits`: readonly ...; \}; \} \| \{ `_tag`: `"generalist/core/GateFailed"`; `gate`: \{ `evidence`: `Schema.Json`; `name`: `string`; `verdict`: ... \| ...; \}; `hint`: `string`; \} \| \{ `_tag`: `"generalist/core/PermissionDenied"`; `hint`: `string`; `message`: `string`; \}; `hint`: `string`; `message`: `string`; \}; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>; `placementId`: `Schema.String`; `ref`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `settlementId`: `Schema.String`; \}\>

Durable terminal delivery replayed until the parent acknowledges it.

***

<a id="externalrunref-1"></a>

### ExternalRunRef

> `const` **ExternalRunRef**: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>

A Run address owned by an external partition.

***

<a id="identifyrequest"></a>

### identifyRequest

> `const` **identifyRequest**: (`request`) => `Effect.Effect`\<\{ `executableDigest`: `string`; `requestDigest`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `never`\>

**`Experimental`**

Bounded canonical request identity shared by reservation and receiver admission.

#### Parameters

##### request

[`AdmissionRequest`](#admissionrequest)

#### Returns

`Effect.Effect`\<\{ `executableDigest`: `string`; `requestDigest`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `never`\>

***

<a id="pageinput-1"></a>

### PageInput

> `const` **PageInput**: `Schema.Struct`\<\{ `afterPlacementId`: `Schema.optionalKey`\<`Schema.String`\>; `limit`: `Schema.Int`; \}\>

**`Experimental`**

Bounded immutable-key enumeration; restart each recovery sweep from the beginning.

***

<a id="parentsuspension-1"></a>

### ParentSuspension

> `const` **ParentSuspension**: `Schema.Struct`\<\{ `checkpoint`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<...\>; `remaining`: `Schema.Struct`\<...\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: ...; `executable`: ...; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Program"`, \{ `branch`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `namespace`: ...; `replay`: ...; \}\>\>; `version`: `Schema.Literal`\<`"1"`\>; \}\>\]\>\>; `continuation`: `Schema.optionalKey`\<`Schema.NullOr`\<`Schema.Struct`\<\{ `nextTurn`: `Schema.Int`; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `queue`: `Schema.optionalKey`\<`Schema.Literal`\<`"steering"`\>\>; `schemaVersion`: `Schema.Literal`\<`1`\>; `steeringEntryIds`: `Schema.$Array`\<`Schema.String`\>; \}\>\>\>; `suspension`: `Schema.Codec`\<[`ExecutionSuspension`](./runtime/namespaces/ExecutionState.md#executionsuspension), `unknown`, `never`, `never`\>; `wait`: `Schema.Struct`\<\{ `closedAt`: `Schema.optionalKey`\<`Schema.String`\>; `openedAt`: `Schema.String`; `reason`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"ToolWait"`, \{ \}\>, `Schema.TaggedStruct`\<`"Approval"`, \{ `request`: `Schema.Struct`\<\{ `approvalId`: ...; `capability`: ...; `input`: ...; `operation`: ...; \}\>; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Timer"`, \{ `dueAt`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"External"`, \{ `capability`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"AwaitEvent"`, \{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly ...\>; \}\>\]\>; `resolution`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<...\>; \}\>, `Schema.TaggedStruct`\<`"ToolResult"`, \{ `encodedResult`: `Schema.Unknown`; `result`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; `payload`: `Schema.optionalKey`\<...\>; \}\>\]\>\>; `status`: `Schema.Literals`\<readonly \[`"open"`, `"responded"`, `"signaled"`, `"cancelled"`\]\>; `waitId`: `Schema.String`; \}\>; \}\>

Optional parent suspension committed atomically with external placement.

***

<a id="placement-1"></a>

### Placement

> `const` **Placement**: `Schema.Struct`\<\{ `acknowledged`: `Schema.Boolean`; `cancelRequested`: `Schema.Boolean`; `executableDigest`: `Schema.String`; `invocationId`: `Schema.String`; `outcome`: `Schema.optionalKey`\<`Schema.Codec`\<[`RunOutcome`](./runtime/namespaces/Run.md#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: \{ `output`: `unknown`; `session`: \{ `leafId`: `string` \| `null`; `sessionId`: `string`; \}; `text`: `string`; `turns`: `number`; \} \| \{ `_tag`: `"Program"`; `value`: `unknown`; \}; \} \| \{ `_tag`: `"Failed"`; `error`: \{ `_tag`: `"generalist/core/SandboxUnavailable"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxSourceInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxInputInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxOutputInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxProtocolViolation"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxDeadlineExceeded"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxCancelled"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxResourceExceeded"`; `hint`: `string`; `limit`: `number`; `resource`: `"cpu"` \| `"output"` \| `"subrequests"`; \} \| \{ `_tag`: `"generalist/core/SandboxGuaranteeUnavailable"`; `guarantee`: `"cpuMillis"` \| `"deadlineMillis"` \| `"filesystem"` \| `"network"` \| `"outputBytes"` \| `"persistence"` \| `"physicalIsolation"` \| `"processes"` \| `"subrequests"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxExecutionFailure"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCapabilityMissing"`; `capability`: `string`; `hint`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCapabilityDenied"`; `capability`: `string`; `hint`: `string`; `operation`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramAuthorizationFailure"`; `capability`: `string`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramSchemaFailure"`; `boundary`: `"agent-input"` \| `"agent-output"` \| `"program-input"` \| `"program-output"` \| `"step-input"` \| `"step-output"` \| `"tool-input"` \| `"tool-output"`; `capability?`: `string`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramToolFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `tool`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramStepFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `step`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramAgentFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `selection`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramBudgetExhausted"`; `dimension`: `"agentRuns"` \| `"concurrency"` \| `"logBytes"` \| `"outputBytes"` \| `"tokens"` \| `"toolCalls"` \| `"wallClockMillis"`; `hint`: `string`; `limit`: `number`; \} \| \{ `_tag`: `"generalist/core/ProgramReplayDivergence"`; `actual`: `string`; `expected`: `string`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramOperationUnknown"`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramSuspended"`; `hint`: `string`; `operation`: `string`; `reason`: `"agent"` \| `"approval"` \| `"step"` \| `"tool-wait"`; `token?`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCancelled"`; `hint`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramHandlerMismatch"`; `hint`: `string`; `kind`: `"agent"` \| `"step"` \| `"tool"`; `name`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramIdentityMismatch"`; `actual`: `string`; `expected`: `string`; `hint`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableIdentityMismatch"`; `actualRef`: \{ `active`: `string`; `executable`: `string`; \}; `expectedRef`: \{ `active`: `string`; `executable`: `string`; \}; `hint`: `string`; `runId`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutablePinMissing"`; `hint`: `string`; `ref`: \{ `active`: `string`; `executable`: `string`; \}; `runId`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableRegistrationInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableRegistrationMissing"`; `hint`: `string`; `pin`: `string`; \} \| \{ `_tag`: `"generalist/runtime/AgentExecutionFailure"`; `cause?`: `Schema.Json`; `failure?`: \{ `_tag`: `"generalist/core/RunBudgetExhausted"`; `budget`: ... \| ... \| ... \| ... \| ...; `hint`: `string`; `remaining?`: `number`; `requested`: `number`; \} \| \{ `_tag`: `"generalist/core/ResumeMismatch"`; `expected?`: ... \| ...; `hint`: `string`; `reason`: ... \| ...; `received`: \{ `_tag`: ...; `checkpoint`: ...; `hint`: ...; `waits`: ...; \}; \} \| \{ `_tag`: `"generalist/core/GateFailed"`; `gate`: \{ `evidence`: ...; `name`: ...; `verdict`: ...; \}; `hint`: `string`; \} \| \{ `_tag`: `"generalist/core/PermissionDenied"`; `hint`: `string`; `message`: `string`; \}; `hint`: `string`; `message`: `string`; \}; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>\>; `parentRunId`: `Schema.String`; `placementId`: `Schema.String`; `request`: `Schema.Struct`\<\{ `parent`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `ref`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `root`: `Schema.Struct`\<\{ `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `executableManifest`: `Schema.Codec`\<[`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest), [`ExecutableManifestEncoded`](./generalist/namespaces/ExecutableManifest.md#executablemanifestencoded), `never`, `never`\>; `executableRef`: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[..., ...\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>; `message`: `Schema.Struct`\<\{ `causationId`: `Schema.optionalKey`\<`Schema.String`\>; `correlationId`: `Schema.String`; `from`: `Schema.optionalKey`\<`Schema.brand`\<`Schema.String`, `"Address"`\>\>; `id`: `Schema.String`; `idempotencyKey`: `Schema.String`; `inReplyTo`: `Schema.optionalKey`\<`Schema.String`\>; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `sessionId`: `Schema.String`; `to`: `Schema.brand`\<`Schema.String`, `"Address"`\>; \}\>; `registrations`: `Schema.$Array`\<`Schema.Struct`\<\{ `codec`: `Schema.String`; `payload`: `Schema.Unknown`; `pin`: `Schema.String`; `version`: `Schema.String`; \}\>\>; `treePolicy`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `maxDepth`: `Schema.Int`; `maxSubagents`: `Schema.Int`; \}\>\>; \}\>; \}\>; `requestDigest`: `Schema.String`; `settled`: `Schema.Boolean`; `settlementId`: `Schema.optionalKey`\<`Schema.String`\>; `suspensionIdentity`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

Stored placement state returned by every placement operation.

***

<a id="reserveinput-1"></a>

### ReserveInput

> `const` **ReserveInput**: `Schema.Struct`\<\{ `attemptFence`: `Schema.Int`; `executableDigest`: `Schema.String`; `invocationId`: `Schema.String`; `ownerId`: `Schema.String`; `parentSuspension`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `checkpoint`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `budget`: ...; `driverVersion`: ...; `executable`: ...; `state`: ...; `turn`: ...; \}\>, `Schema.TaggedStruct`\<`"Program"`, \{ `branch`: ...; `version`: ...; \}\>\]\>\>; `continuation`: `Schema.optionalKey`\<`Schema.NullOr`\<`Schema.Struct`\<\{ `nextTurn`: `Schema.Int`; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `queue`: `Schema.optionalKey`\<`Schema.Literal`\<...\>\>; `schemaVersion`: `Schema.Literal`\<`1`\>; `steeringEntryIds`: `Schema.$Array`\<`Schema.String`\>; \}\>\>\>; `suspension`: `Schema.Codec`\<[`ExecutionSuspension`](./runtime/namespaces/ExecutionState.md#executionsuspension), `unknown`, `never`, `never`\>; `wait`: `Schema.Struct`\<\{ `closedAt`: `Schema.optionalKey`\<`Schema.String`\>; `openedAt`: `Schema.String`; `reason`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>\]\>; `resolution`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[..., ..., ..., ...\]\>\>; `status`: `Schema.Literals`\<readonly \[`"open"`, `"responded"`, `"signaled"`, `"cancelled"`\]\>; `waitId`: `Schema.String`; \}\>; \}\>\>; `placementId`: `Schema.String`; `request`: `Schema.Struct`\<\{ `parent`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `ref`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `root`: `Schema.Struct`\<\{ `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `executableManifest`: `Schema.Codec`\<[`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest), [`ExecutableManifestEncoded`](./generalist/namespaces/ExecutableManifest.md#executablemanifestencoded), `never`, `never`\>; `executableRef`: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[..., ...\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>; `message`: `Schema.Struct`\<\{ `causationId`: `Schema.optionalKey`\<`Schema.String`\>; `correlationId`: `Schema.String`; `from`: `Schema.optionalKey`\<`Schema.brand`\<`Schema.String`, `"Address"`\>\>; `id`: `Schema.String`; `idempotencyKey`: `Schema.String`; `inReplyTo`: `Schema.optionalKey`\<`Schema.String`\>; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `sessionId`: `Schema.String`; `to`: `Schema.brand`\<`Schema.String`, `"Address"`\>; \}\>; `registrations`: `Schema.$Array`\<`Schema.Struct`\<\{ `codec`: `Schema.String`; `payload`: `Schema.Unknown`; `pin`: `Schema.String`; `version`: `Schema.String`; \}\>\>; `treePolicy`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `maxDepth`: `Schema.Int`; `maxSubagents`: `Schema.Int`; \}\>\>; \}\>; \}\>; `requestDigest`: `Schema.String`; `runId`: `Schema.String`; `session`: `Schema.Struct`\<\{ `epoch`: `Schema.String`; `ownerId`: `Schema.String`; `runAttemptFence`: `Schema.Finite`; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>

Immutable admission facts plus current parent claim authority.

***

<a id="rootadmission-1"></a>

### RootAdmission

> `const` **RootAdmission**: `Schema.Struct`\<\{ `executableDigest`: `Schema.String`; `parent`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `placementId`: `Schema.String`; `ref`: `Schema.Struct`\<\{ `partition`: `Schema.String`; `runId`: `Schema.String`; \}\>; `requestDigest`: `Schema.String`; `root`: `Schema.Struct`\<\{ `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `executableManifest`: `Schema.Codec`\<[`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest), [`ExecutableManifestEncoded`](./generalist/namespaces/ExecutableManifest.md#executablemanifestencoded), `never`, `never`\>; `executableRef`: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>; `message`: `Schema.Struct`\<\{ `causationId`: `Schema.optionalKey`\<`Schema.String`\>; `correlationId`: `Schema.String`; `from`: `Schema.optionalKey`\<`Schema.brand`\<`Schema.String`, `"Address"`\>\>; `id`: `Schema.String`; `idempotencyKey`: `Schema.String`; `inReplyTo`: `Schema.optionalKey`\<`Schema.String`\>; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `sessionId`: `Schema.String`; `to`: `Schema.brand`\<`Schema.String`, `"Address"`\>; \}\>; `registrations`: `Schema.$Array`\<`Schema.Struct`\<\{ `codec`: `Schema.String`; `payload`: `Schema.Unknown`; `pin`: `Schema.String`; `version`: `Schema.String`; \}\>\>; `treePolicy`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `maxDepth`: `Schema.Int`; `maxSubagents`: `Schema.Int`; \}\>\>; \}\>; \}\>

**`Experimental`**

Exact receiver command; its envelope is the same one committed by the parent.

***

<a id="suspensionidentity"></a>

### suspensionIdentity

> `const` **suspensionIdentity**: (`input`) => `string`

Stable identity of an optional parent wait/suspension closure.

#### Parameters

##### input

[`ParentSuspension`](#parentsuspension)

#### Returns

`string`
