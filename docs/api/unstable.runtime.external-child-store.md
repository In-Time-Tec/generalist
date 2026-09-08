[**generalist**](./index.md)

***

[generalist](./index.md) / unstable.runtime.external-child-store

# unstable.runtime.external-child-store

## Classes

<a id="externalchildstore"></a>

### ExternalChildStore

Atomic cross-partition child placement capability.

#### Extends

- `ExternalChildStore_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ExternalChildStore**(`_`): [`ExternalChildStore`](#externalchildstore)

###### Parameters

###### \_

`never`

###### Returns

[`ExternalChildStore`](#externalchildstore)

###### Inherited from

`ExternalChildStore_base.constructor`

## Interfaces

<a id="page"></a>

### Page

**`Experimental`**

One bounded immutable-key scan window; an empty item page may still have a continuation.

#### Type Parameters

##### A

`A`

#### Properties

<a id="cursor"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `string`

**`Experimental`**

<a id="items"></a>

##### items

> `readonly` **items**: readonly `A`[]

**`Experimental`**

***

<a id="service"></a>

### Service

Cross-partition child placement operations supported by single-partition stores.

#### Properties

<a id="acknowledge"></a>

##### acknowledge

> `readonly` **acknowledge**: (`placementId`) => `Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement.md#externalchildplacementnotfound)\>

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement.md#externalchildplacementnotfound)\>

<a id="acknowledgerootsettlement"></a>

##### acknowledgeRootSettlement

> `readonly` **acknowledgeRootSettlement**: (`input`) => `Effect`\<\{ `acknowledged`: `boolean`; `outcome`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `settlementId`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalChildSettlementConflict`](./unstable.runtime.external-child-placement.md#externalchildsettlementconflict) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement.md#externalrootnotfound)\>

Acknowledge exactly the terminal identity received by the parent.

###### Parameters

###### input

###### placementId

`string`

###### settlementId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `outcome`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `settlementId`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalChildSettlementConflict`](./unstable.runtime.external-child-placement.md#externalchildsettlementconflict) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement.md#externalrootnotfound)\>

<a id="activateroot"></a>

##### activateRoot

> `readonly` **activateRoot**: (`placementId`) => `Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement.md#externalrootnotfound)\>

Release one admitted root's durable execution gate. Exact retries are no-ops.

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement.md#externalrootnotfound)\>

<a id="admitroot"></a>

##### admitRoot

> `readonly` **admitRoot**: (`input`) => `Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`StartError`](./runtime/namespaces/Runtime.md#starterror) \| [`ExternalRootConflict`](./unstable.runtime.external-child-placement.md#externalrootconflict) \| [`ExternalRootExecutableMismatch`](./unstable.runtime.external-child-placement.md#externalrootexecutablemismatch)\>

Admit an independently executable depth-zero root, initially fenced from execution.

###### Parameters

###### input

###### executableDigest

`string`

###### parent

\{ `partition`: `string`; `runId`: `string`; \}

###### parent.partition

`string`

###### parent.runId

`string`

###### placementId

`string`

###### ref

\{ `partition`: `string`; `runId`: `string`; \}

###### ref.partition

`string`

###### ref.runId

`string`

###### requestDigest

`string`

###### root

\{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}

###### root.budget?

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### root.budget.children?

`number`

###### root.budget.duration?

`number`

###### root.budget.tokens?

`number`

###### root.budget.toolCalls?

`number`

###### root.budget.usd?

`number`

###### root.executableManifest

[`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### root.executableRef

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### root.executableRef.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### root.executableRef.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### root.message

\{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}

###### root.message.causationId?

`string`

###### root.message.correlationId

`string`

###### root.message.from?

`string` & `Brand`\<`"Address"`\>

###### root.message.id

`string`

###### root.message.idempotencyKey

`string`

###### root.message.inReplyTo?

`string`

###### root.message.metadata

\{\[`key`: `string`\]: `unknown`; \}

###### root.message.prompt

`Prompt`

###### root.message.sessionId

`string`

###### root.message.to

`string` & `Brand`\<`"Address"`\>

###### root.registrations

readonly `object`[]

###### root.treePolicy?

\{ `maxDepth`: `number`; `maxSubagents`: `number`; \}

###### root.treePolicy.maxDepth

`number`

###### root.treePolicy.maxSubagents

`number`

###### Returns

`Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`StartError`](./runtime/namespaces/Runtime.md#starterror) \| [`ExternalRootConflict`](./unstable.runtime.external-child-placement.md#externalrootconflict) \| [`ExternalRootExecutableMismatch`](./unstable.runtime.external-child-placement.md#externalrootexecutablemismatch)\>

<a id="cancel"></a>

##### cancel

> `readonly` **cancel**: (`placementId`) => `Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement.md#externalchildplacementnotfound)\>

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement.md#externalchildplacementnotfound)\>

<a id="cancelroot"></a>

##### cancelRoot

> `readonly` **cancelRoot**: (`placementId`, `reason?`) => `Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement.md#externalrootnotfound)\>

Request authoritative cancellation on the child partition, including before activation.

###### Parameters

###### placementId

`string`

###### reason?

`string`

###### Returns

`Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement.md#externalrootnotfound)\>

<a id="inspectplacement"></a>

##### inspectPlacement

> `readonly` **inspectPlacement**: (`placementId`) => `Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement.md#externalchildplacementnotfound)\>

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement.md#externalchildplacementnotfound)\>

<a id="inspectroot"></a>

##### inspectRoot

> `readonly` **inspectRoot**: (`placementId`) => `Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement.md#externalrootnotfound)\>

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement.md#externalrootnotfound)\>

<a id="outstandingplacements"></a>

##### outstandingPlacements

> `readonly` **outstandingPlacements**: (`input`) => `Effect`\<[`Page`](#page)\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}\>, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable)\>

###### Parameters

###### input

###### afterPlacementId?

`string`

###### limit

`number`

###### Returns

`Effect`\<[`Page`](#page)\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}\>, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable)\>

<a id="outstandingroots"></a>

##### outstandingRoots

> `readonly` **outstandingRoots**: (`input`) => `Effect`\<[`Page`](#page)\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}\>, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable)\>

###### Parameters

###### input

###### afterPlacementId?

`string`

###### limit

`number`

###### Returns

`Effect`\<[`Page`](#page)\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}\>, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable)\>

<a id="reserve"></a>

##### reserve

> `readonly` **reserve**: (`input`) => `Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`RunNotFound`](./runtime/namespaces/Errors.md#runnotfound) \| [`ExternalChildCapacityUnavailable`](./unstable.runtime.external-child-placement.md#externalchildcapacityunavailable) \| [`ExternalChildPlacementConflict`](./unstable.runtime.external-child-placement.md#externalchildplacementconflict) \| [`RunTerminal`](./runtime/namespaces/Errors.md#runterminal) \| [`StaleClaim`](./runtime/namespaces/Errors.md#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

###### attemptFence

`number`

###### executableDigest

`string`

###### invocationId

`string`

###### ownerId

`string`

###### parentSuspension?

\{ `checkpoint?`: \{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<...\> \| `string` & `Brand`\<...\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `branch?`: \{ `namespace`: `string`; `replay`: \{\[`key`: `string`\]: `string`; \}; \}; `version`: `"1"`; \}; `continuation?`: \{ `nextTurn`: `number`; `prompt`: `Prompt`; `queue?`: `"steering"`; `schemaVersion`: `1`; `steeringEntryIds`: readonly `string`[]; \} \| `null`; `suspension`: [`ExecutionSuspension`](./runtime/namespaces/ExecutionState.md#executionsuspension); `wait`: \{ `closedAt?`: `string`; `openedAt`: `string`; `reason`: \{ \} \| \{ `request`: \{ `approvalId`: `string`; `capability`: `string`; `input`: `unknown`; `operation`: `string`; \}; \} \| \{ `name`: `string`; \} \| \{ `dueAt?`: `string`; \} \| \{ `capability?`: `string`; \} \| \{ `deadline`: `string`; `filter`: \{ `scheduleId?`: `string`; \} \| \{ `source?`: `string`; \} \| \{ `childRunId?`: `string`; \} \| \{ `kind?`: `"update"` \| `"create"` \| `"remove"`; `path?`: `string`; \} \| \{ `approvalId?`: `string`; \}; \}; `resolution?`: \{ \} \| \{ `reason?`: `string`; \} \| \{ `encodedResult`: `unknown`; `result`: `unknown`; \} \| \{ `name`: `string`; `payload?`: `unknown`; \}; `status`: `"cancelled"` \| `"open"` \| `"responded"` \| `"signaled"`; `waitId`: `string`; \}; \}

###### parentSuspension.checkpoint?

\{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<...\> \| `string` & `Brand`\<...\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `branch?`: \{ `namespace`: `string`; `replay`: \{\[`key`: `string`\]: `string`; \}; \}; `version`: `"1"`; \}

###### parentSuspension.continuation?

\{ `nextTurn`: `number`; `prompt`: `Prompt`; `queue?`: `"steering"`; `schemaVersion`: `1`; `steeringEntryIds`: readonly `string`[]; \} \| `null`

###### parentSuspension.suspension

[`ExecutionSuspension`](./runtime/namespaces/ExecutionState.md#executionsuspension)

###### parentSuspension.wait

\{ `closedAt?`: `string`; `openedAt`: `string`; `reason`: \{ \} \| \{ `request`: \{ `approvalId`: `string`; `capability`: `string`; `input`: `unknown`; `operation`: `string`; \}; \} \| \{ `name`: `string`; \} \| \{ `dueAt?`: `string`; \} \| \{ `capability?`: `string`; \} \| \{ `deadline`: `string`; `filter`: \{ `scheduleId?`: `string`; \} \| \{ `source?`: `string`; \} \| \{ `childRunId?`: `string`; \} \| \{ `kind?`: `"update"` \| `"create"` \| `"remove"`; `path?`: `string`; \} \| \{ `approvalId?`: `string`; \}; \}; `resolution?`: \{ \} \| \{ `reason?`: `string`; \} \| \{ `encodedResult`: `unknown`; `result`: `unknown`; \} \| \{ `name`: `string`; `payload?`: `unknown`; \}; `status`: `"cancelled"` \| `"open"` \| `"responded"` \| `"signaled"`; `waitId`: `string`; \}

###### parentSuspension.wait.closedAt?

`string`

###### parentSuspension.wait.openedAt

`string`

###### parentSuspension.wait.reason

\{ \} \| \{ `request`: \{ `approvalId`: `string`; `capability`: `string`; `input`: `unknown`; `operation`: `string`; \}; \} \| \{ `name`: `string`; \} \| \{ `dueAt?`: `string`; \} \| \{ `capability?`: `string`; \} \| \{ `deadline`: `string`; `filter`: \{ `scheduleId?`: `string`; \} \| \{ `source?`: `string`; \} \| \{ `childRunId?`: `string`; \} \| \{ `kind?`: `"update"` \| `"create"` \| `"remove"`; `path?`: `string`; \} \| \{ `approvalId?`: `string`; \}; \}

###### parentSuspension.wait.resolution?

\{ \} \| \{ `reason?`: `string`; \} \| \{ `encodedResult`: `unknown`; `result`: `unknown`; \} \| \{ `name`: `string`; `payload?`: `unknown`; \}

###### parentSuspension.wait.status

`"cancelled"` \| `"open"` \| `"responded"` \| `"signaled"`

###### parentSuspension.wait.waitId

`string`

###### placementId

`string`

###### request

\{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}

###### request.parent

\{ `partition`: `string`; `runId`: `string`; \}

###### request.parent.partition

`string`

###### request.parent.runId

`string`

###### request.ref

\{ `partition`: `string`; `runId`: `string`; \}

###### request.ref.partition

`string`

###### request.ref.runId

`string`

###### request.root

\{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}

###### request.root.budget?

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### request.root.budget.children?

`number`

###### request.root.budget.duration?

`number`

###### request.root.budget.tokens?

`number`

###### request.root.budget.toolCalls?

`number`

###### request.root.budget.usd?

`number`

###### request.root.executableManifest

[`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### request.root.executableRef

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### request.root.executableRef.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### request.root.executableRef.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### request.root.message

\{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}

###### request.root.message.causationId?

`string`

###### request.root.message.correlationId

`string`

###### request.root.message.from?

`string` & `Brand`\<`"Address"`\>

###### request.root.message.id

`string`

###### request.root.message.idempotencyKey

`string`

###### request.root.message.inReplyTo?

`string`

###### request.root.message.metadata

\{\[`key`: `string`\]: `unknown`; \}

###### request.root.message.prompt

`Prompt`

###### request.root.message.sessionId

`string`

###### request.root.message.to

`string` & `Brand`\<`"Address"`\>

###### request.root.registrations

readonly `object`[]

###### request.root.treePolicy?

\{ `maxDepth`: `number`; `maxSubagents`: `number`; \}

###### request.root.treePolicy.maxDepth

`number`

###### request.root.treePolicy.maxSubagents

`number`

###### requestDigest

`string`

###### runId

`string`

###### session

\{ `epoch`: `string`; `ownerId`: `string`; `runAttemptFence`: `number`; `runId`: `string`; `sessionId`: `string`; \}

###### session.epoch

`string`

###### session.ownerId

`string`

###### session.runAttemptFence

`number`

###### session.runId

`string`

###### session.sessionId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`RunNotFound`](./runtime/namespaces/Errors.md#runnotfound) \| [`ExternalChildCapacityUnavailable`](./unstable.runtime.external-child-placement.md#externalchildcapacityunavailable) \| [`ExternalChildPlacementConflict`](./unstable.runtime.external-child-placement.md#externalchildplacementconflict) \| [`RunTerminal`](./runtime/namespaces/Errors.md#runterminal) \| [`StaleClaim`](./runtime/namespaces/Errors.md#staleclaim) \| `StaleSessionClaim`\>

<a id="rootsettlement"></a>

##### rootSettlement

> `readonly` **rootSettlement**: (`placementId`) => `Effect`\<`Option`\<\{ `acknowledged`: `boolean`; `outcome`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `settlementId`: `string`; \}\>, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement.md#externalrootnotfound)\>

Read the stable terminal delivery. None means the root is not terminal yet.

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<`Option`\<\{ `acknowledged`: `boolean`; `outcome`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `settlementId`: `string`; \}\>, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement.md#externalrootnotfound)\>

<a id="settle"></a>

##### settle

> `readonly` **settle**: (`input`) => `Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement.md#externalchildplacementnotfound) \| [`ExternalChildSettlementConflict`](./unstable.runtime.external-child-placement.md#externalchildsettlementconflict)\>

###### Parameters

###### input

###### outcome

[`RunOutcome`](./runtime/namespaces/Run.md#runoutcome)

###### placementId

`string`

###### settlementId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run.md#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `request`: \{ `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `root`: \{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `message`: \{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `maxDepth`: `number`; `maxSubagents`: `number`; \}; \}; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement.md#externalchildplacementnotfound) \| [`ExternalChildSettlementConflict`](./unstable.runtime.external-child-placement.md#externalchildsettlementconflict)\>
