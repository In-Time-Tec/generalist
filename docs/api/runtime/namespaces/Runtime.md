[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / Runtime

# Runtime

## Classes

<a id="runtime"></a>

### Runtime

Hosted Runtime public contract and memory-backed layers.

#### Extends

- `Runtime_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new Runtime**(`_`): [`Runtime`](#runtime)

###### Parameters

###### \_

`never`

###### Returns

[`Runtime`](#runtime)

###### Inherited from

`Runtime_base.constructor`

***

<a id="scheduleinvalid"></a>

### ScheduleInvalid

A recurrence rule is outside Generalist's documented fixed UTC subset.

#### Extends

- `ScheduleInvalid_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new ScheduleInvalid**(...`args`): [`ScheduleInvalid`](#scheduleinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ScheduleInvalid`](#scheduleinvalid)

###### Inherited from

`ScheduleInvalid_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ScheduleInvalid_base.hint`

<a id="rrule"></a>

##### rrule

> `readonly` **rrule**: `string`

###### Inherited from

`ScheduleInvalid_base.rrule`

***

<a id="wakeeventinvalid"></a>

### WakeEventInvalid

A Runtime wake value failed the public `WakeEvent` Schema.

#### Extends

- `WakeEventInvalid_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new WakeEventInvalid**(...`args`): [`WakeEventInvalid`](#wakeeventinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`WakeEventInvalid`](#wakeeventinvalid)

###### Inherited from

`WakeEventInvalid_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`WakeEventInvalid_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`WakeEventInvalid_base.message`

## Interfaces

<a id="activateinput"></a>

### ActivateInput

Release one admitted root's durable execution gate.

#### Properties

<a id="commandid"></a>

##### commandId

> `readonly` **commandId**: `string`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="addressbinding"></a>

### AddressBinding

#### Properties

<a id="address"></a>

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

<a id="executable"></a>

##### executable

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest.md#pinnedexecutable)

<a id="registrations"></a>

##### registrations

> `readonly` **registrations**: readonly `object`[]

***

<a id="awaitchildsettlementinput"></a>

### AwaitChildSettlementInput

#### Properties

<a id="childrunid"></a>

##### childRunId

> `readonly` **childRunId**: `string`

<a id="parentrunid"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

***

<a id="awaitsessionterminalinput"></a>

### AwaitSessionTerminalInput

#### Properties

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="cancelinput"></a>

### CancelInput

#### Extends

- `CommandIdentity`

#### Properties

<a id="commandid-1"></a>

##### commandId

> `readonly` **commandId**: `string`

###### Inherited from

`CommandIdentity.commandId`

<a id="reason"></a>

##### reason?

> `readonly` `optional` **reason?**: `string`

<a id="runid-1"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="cancelsessioninput"></a>

### CancelSessionInput

#### Extends

- `CommandIdentity`

#### Properties

<a id="commandid-2"></a>

##### commandId

> `readonly` **commandId**: `string`

###### Inherited from

`CommandIdentity.commandId`

<a id="reason-1"></a>

##### reason?

> `readonly` `optional` **reason?**: `string`

<a id="sessionid-1"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="childsettlementchangesinput"></a>

### ChildSettlementChangesInput

#### Properties

<a id="aftersequence"></a>

##### afterSequence?

> `readonly` `optional` **afterSequence?**: `number`

<a id="parentrunid-1"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

***

<a id="childsettlementsinput"></a>

### ChildSettlementsInput

#### Properties

<a id="aftersequence-1"></a>

##### afterSequence?

> `readonly` `optional` **afterSequence?**: `number`

<a id="limit"></a>

##### limit

> `readonly` **limit**: `number`

<a id="parentrunid-2"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

***

<a id="eventsinput"></a>

### EventsInput

#### Extended by

- [`HistoryInput`](#historyinput)

#### Properties

<a id="cursor"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `number`

<a id="runid-2"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="fanoutinput"></a>

### FanOutInput

#### Properties

<a id="concurrency"></a>

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

<a id="idempotencykey"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

<a id="join"></a>

##### join

> `readonly` **join**: \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \} \| \{ \}

<a id="members"></a>

##### members

> `readonly` **members**: readonly [`FanOutMemberInput`](#fanoutmemberinput)[]

<a id="parentrunid-3"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

<a id="remainder"></a>

##### remainder

> `readonly` **remainder**: `"await"` \| `"request-cancel"` \| `"terminate"` \| `"abandon"`

***

<a id="fanoutmemberinput"></a>

### FanOutMemberInput

#### Properties

<a id="inherit"></a>

##### inherit?

> `readonly` `optional` **inherit?**: [`InheritanceOptions`](../../generalist/namespaces/Agent.md#inheritanceoptions)

<a id="key"></a>

##### key

> `readonly` **key**: `string`

<a id="label"></a>

##### label?

> `readonly` `optional` **label?**: `string`

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

<a id="origin"></a>

##### origin?

> `readonly` `optional` **origin?**: `object`

###### operationKey?

> `readonly` `optional` **operationKey?**: `string`

###### parentToolCallId?

> `readonly` `optional` **parentToolCallId?**: `string`

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

<a id="selection"></a>

##### selection

> `readonly` **selection**: `string`

<a id="sessionid-2"></a>

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

***

<a id="historyinput"></a>

### HistoryInput

#### Extends

- [`EventsInput`](#eventsinput)

#### Properties

<a id="cursor-1"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `number`

###### Inherited from

[`EventsInput`](#eventsinput).[`cursor`](#cursor)

<a id="limit-1"></a>

##### limit

> `readonly` **limit**: `number`

<a id="runid-3"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`EventsInput`](#eventsinput).[`runId`](#runid-2)

***

<a id="initialchildinput"></a>

### InitialChildInput

#### Properties

<a id="correlationid"></a>

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

<a id="idempotencykey-1"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

<a id="invocationid"></a>

##### invocationId

> `readonly` **invocationId**: `string`

<a id="messageid"></a>

##### messageId?

> `readonly` `optional` **messageId?**: `string`

<a id="metadata-1"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

<a id="prompt-1"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

<a id="selection-1"></a>

##### selection

> `readonly` **selection**: `string`

<a id="sessionid-3"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="layeroptions"></a>

### LayerOptions

#### Extended by

- [`Options`](../../durability.md#options)

#### Properties

<a id="activationprojection"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: `RunActivationProjection`

Final-state callback executed synchronously inside each authoritative store transaction.

<a id="addresses"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](#addressbinding)[]

<a id="messagingpolicy"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](./Messaging/namespaces/MessagingPolicy.md#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

<a id="scheduler"></a>

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

<a id="subscriberqueuecapacity"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

***

<a id="listinput"></a>

### ListInput

#### Properties

<a id="limit-2"></a>

##### limit

> `readonly` **limit**: `number`

<a id="status"></a>

##### status?

> `readonly` `optional` **status?**: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`

***

<a id="messagesinput"></a>

### MessagesInput

#### Properties

<a id="limit-3"></a>

##### limit

> `readonly` **limit**: `number`

<a id="runid-4"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="operatorservice"></a>

### OperatorService

#### Properties

<a id="explain"></a>

##### explain

> `readonly` **explain**: (`runId`) => `Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`; \}, [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`; \}, [`InspectError`](#inspecterror)\>

<a id="extendbudget"></a>

##### extendBudget

> `readonly` **extendBudget**: (`runId`, `delta`, `operator`, `commandId`) => `Effect`\<`void`, [`OperatorExtendBudgetError`](#operatorextendbudgeterror)\>

###### Parameters

###### runId

`string`

###### delta

[`Input`](../../generalist/namespaces/RunBudget.md#input)

###### operator

`string`

###### commandId

`string`

###### Returns

`Effect`\<`void`, [`OperatorExtendBudgetError`](#operatorextendbudgeterror)\>

<a id="resolveapproval"></a>

##### resolveApproval

> `readonly` **resolveApproval**: (`token`, `decision`, `operator`) => `Effect`\<`void`, [`OperatorApprovalError`](#operatorapprovalerror), [`RuleStore`](../../permissions.md#rulestore)\>

###### Parameters

###### token

`string`

###### decision

[`ResolveApprovalDecision`](./Recovery.md#resolveapprovaldecision)

###### operator

`string`

###### Returns

`Effect`\<`void`, [`OperatorApprovalError`](#operatorapprovalerror), [`RuleStore`](../../permissions.md#rulestore)\>

<a id="resolveunknown"></a>

##### resolveUnknown

> `readonly` **resolveUnknown**: (`runId`, `operationId`, `resolution`, `operator`, `commandId`) => `Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operationId

`string`

###### resolution

\{ `outcome`: `"succeeded"`; `result`: `unknown`; \} \| \{ `error`: `unknown`; `outcome`: `"failed"`; \}

###### operator

`string`

###### commandId

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

<a id="retry"></a>

##### retry

> `readonly` **retry**: (`runId`, `operator`, `commandId`) => `Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operator

`string`

###### commandId

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

<a id="scanobligations"></a>

##### scanObligations

> `readonly` **scanObligations**: () => `Stream`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `runId`: `string`; \}, [`InspectError`](#inspecterror)\>

###### Returns

`Stream`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `runId`: `string`; \}, [`InspectError`](#inspecterror)\>

<a id="verify"></a>

##### verify

> `readonly` **verify**: (`runId`) => `Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `drift`: readonly `string`[]; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`; \}, [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `drift`: readonly `string`[]; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`; \}, [`InspectError`](#inspecterror)\>

<a id="wake"></a>

##### wake

> `readonly` **wake**: (`runId`, `operator`, `commandId`) => `Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operator

`string`

###### commandId

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

***

<a id="previewsinput"></a>

### PreviewsInput

Select the memory-only live preview lane for one Run.

#### Properties

<a id="runid-5"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="registeragentnameinput"></a>

### RegisterAgentNameInput

#### Properties

<a id="name"></a>

##### name

> `readonly` **name**: `string` & `Brand`\<`"generalist/runtime/AgentName"`\>

<a id="runid-6"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="respondinput"></a>

### RespondInput

#### Properties

<a id="resolution"></a>

##### resolution

> `readonly` **resolution**: \{ \} \| \{ `reason?`: `string`; \} \| \{ `encodedResult`: `unknown`; `result`: `unknown`; \}

<a id="runid-7"></a>

##### runId

> `readonly` **runId**: `string`

<a id="waitid"></a>

##### waitId

> `readonly` **waitId**: `string`

***

<a id="runhandle"></a>

### RunHandle

One typed durable Run and its replay-then-live event stream.

#### Type Parameters

##### Output

`Output`

#### Properties

<a id="await"></a>

##### await

> `readonly` **await**: `Effect`\<`Output`, [`RunFailed`](./RunEvent.md#runfailed) \| [`RunCancelled`](./RunEvent.md#runcancelled) \| [`EventsError`](#eventserror) \| [`InvalidOutput`](../../generalist/namespaces/AgentEvent.md#invalidoutput)\>

<a id="events"></a>

##### events

> `readonly` **events**: `Stream`\<[`StartEvent`](../../generalist/namespaces/Agent.md#startevent)\<`Output`\>, [`EventsError`](#eventserror) \| [`InvalidOutput`](../../generalist/namespaces/AgentEvent.md#invalidoutput)\>

<a id="runid-8"></a>

##### runId

> `readonly` **runId**: `string`

<a id="send"></a>

##### send

> `readonly` **send**: (`message`, `options?`) => `Effect`\<\{ `entryId`: `string`; `sequence`: `number`; \}, [`RunSendError`](#runsenderror)\>

###### Parameters

###### message

`string` \| `Prompt`

###### options?

[`RunSendOptions`](#runsendoptions)

###### Returns

`Effect`\<\{ `entryId`: `string`; `sequence`: `number`; \}, [`RunSendError`](#runsenderror)\>

***

<a id="runsendoptions"></a>

### RunSendOptions

Admission options for a message sent to one existing Run.

#### Properties

<a id="from"></a>

##### from?

> `readonly` `optional` **from?**: \{ `runId`: `string`; \} \| \{ `user`: `string`; \} \| \{ `system`: `true`; \}

<a id="idempotencykey-2"></a>

##### idempotencyKey?

> `readonly` `optional` **idempotencyKey?**: `string`

<a id="policy"></a>

##### policy?

> `readonly` `optional` **policy?**: `"steer"` \| `"interrupt"` \| `"rollback"` \| `"reject"`

***

<a id="runtimeinspection"></a>

### RuntimeInspection

Authoritative Runtime inspection, including the process-local Inspector snapshot shape.

#### Extends

- [`RunInspection`](./Run.md#runinspection)

#### Properties

<a id="activetools"></a>

##### activeTools

> `readonly` **activeTools**: readonly `string`[]

<a id="branches"></a>

##### branches

> `readonly` **branches**: readonly `object`[]

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`branches`](./Run.md#branches)

<a id="budget"></a>

##### budget

> `readonly` **budget**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number` \| `"unknown"`

<a id="childreadiness"></a>

##### childReadiness?

> `readonly` `optional` **childReadiness?**: `"queued"` \| `"ready"` \| `"settled"`

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`childReadiness`](./Run.md#childreadiness)

<a id="children"></a>

##### children

> `readonly` **children**: readonly [`ChildInspection`](./ChildAdmission.md#childinspection)[]

<a id="depth"></a>

##### depth

> `readonly` **depth**: `number`

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`depth`](./Run.md#depth-1)

<a id="durability"></a>

##### durability

> `readonly` **durability**: `"ephemeral"` \| `"durable"`

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`durability`](./Run.md#durability)

<a id="elapsed"></a>

##### elapsed

> `readonly` **elapsed**: `number`

<a id="executablemanifest"></a>

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`executableManifest`](./Run.md#executablemanifest-1)

<a id="executableref"></a>

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`executableRef`](./Run.md#executableref-1)

<a id="gates"></a>

##### gates

> `readonly` **gates**: readonly `object`[]

<a id="lastevent"></a>

##### lastEvent?

> `readonly` `optional` **lastEvent?**: `InspectionEvent`

<a id="lastsequence"></a>

##### lastSequence

> `readonly` **lastSequence**: `number`

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`lastSequence`](./Run.md#lastsequence-1)

<a id="parentrunid-4"></a>

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`parentRunId`](./Run.md#parentrunid-1)

<a id="retainedsession"></a>

##### retainedSession?

> `readonly` `optional` **retainedSession?**: `object`

###### depth

> `readonly` **depth**: `number`

###### id

> `readonly` **id**: `string`

###### initialRunId

> `readonly` **initialRunId**: `string`

###### parentRunId

> `readonly` **parentRunId**: `string` \| `null`

###### parentSessionId

> `readonly` **parentSessionId**: `string` \| `null`

###### rootSessionId

> `readonly` **rootSessionId**: `string`

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`retainedSession`](./Run.md#retainedsession)

<a id="runid-9"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`runId`](./Run.md#runid-1)

<a id="status-1"></a>

##### status

> `readonly` **status**: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`status`](./Run.md#status-1)

<a id="suspension"></a>

##### suspension?

> `readonly` `optional` **suspension?**: [`ExecutionSuspension`](./ExecutionState.md#executionsuspension)

<a id="treepolicy"></a>

##### treePolicy

> `readonly` **treePolicy**: `object`

###### concurrency

> `readonly` **concurrency**: `object`

###### concurrency.agents

> `readonly` **agents**: `number`

###### concurrency.tools

> `readonly` **tools**: `number`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSessions

> `readonly` **maxSessions**: `number`

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`treePolicy`](./Run.md#treepolicy-1)

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

<a id="usage"></a>

##### usage

> `readonly` **usage**: `object`

###### inputTokens

> `readonly` **inputTokens**: `number`

###### outputTokens

> `readonly` **outputTokens**: `number`

<a id="usagefacts"></a>

##### usageFacts

> `readonly` **usageFacts**: readonly [`RawUsageFact`](./Run.md#rawusagefact)[]

<a id="waits"></a>

##### waits

> `readonly` **waits**: readonly `object`[]

###### Inherited from

[`RunInspection`](./Run.md#runinspection).[`waits`](./Run.md#waits-1)

***

<a id="scheduleoptions"></a>

### ScheduleOptions

Durable UTC fresh-Run recurrence.

#### Properties

<a id="budget-1"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### allocation

> `readonly` **allocation**: `object`

###### allocation.children?

> `readonly` `optional` **children?**: `number`

###### allocation.duration?

> `readonly` `optional` **duration?**: `number`

###### allocation.tokens?

> `readonly` `optional` **tokens?**: `number`

###### allocation.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### allocation.usd?

> `readonly` `optional` **usd?**: `number`

###### remaining

> `readonly` **remaining**: `object`

###### remaining.children?

> `readonly` `optional` **children?**: `number`

###### remaining.duration?

> `readonly` `optional` **duration?**: `number`

###### remaining.tokens?

> `readonly` `optional` **tokens?**: `number`

###### remaining.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### remaining.usd?

> `readonly` `optional` **usd?**: `number`

<a id="rrule-1"></a>

##### rrule

> `readonly` **rrule**: `string`

<a id="scheduleid"></a>

##### scheduleId?

> `readonly` `optional` **scheduleId?**: `string`

Stable identity for idempotent registration across Runtime restarts.

<a id="sessionid-4"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="sendinput"></a>

### SendInput

#### Properties

<a id="causationid"></a>

##### causationId?

> `readonly` `optional` **causationId?**: `string`

<a id="correlationid-1"></a>

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

<a id="from-1"></a>

##### from?

> `readonly` `optional` **from?**: `string` & `Brand`\<`"Address"`\>

<a id="idempotencykey-3"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

<a id="inreplyto"></a>

##### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

<a id="messageid-1"></a>

##### messageId?

> `readonly` `optional` **messageId?**: `string`

<a id="metadata-2"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

<a id="prompt-2"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

<a id="runid-10"></a>

##### runId?

> `readonly` `optional` **runId?**: `string`

<a id="sessionid-5"></a>

##### sessionId

> `readonly` **sessionId**: `string`

<a id="to"></a>

##### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

<a id="treepolicy-1"></a>

##### treePolicy?

> `readonly` `optional` **treePolicy?**: `object`

###### concurrency

> `readonly` **concurrency**: `object`

###### concurrency.agents

> `readonly` **agents**: `number`

###### concurrency.tools

> `readonly` **tools**: `number`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSessions

> `readonly` **maxSessions**: `number`

***

<a id="sendmessageinput"></a>

### SendMessageInput

One addressed send between agents.

`fromRunId` is the authoritative sender: Generalist reads its identity, parentage, and session from the
durable Run record, so callers cannot forge a sender by supplying an Address.

#### Properties

<a id="causationid-1"></a>

##### causationId?

> `readonly` `optional` **causationId?**: `string`

<a id="correlationid-2"></a>

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

<a id="fromrunid"></a>

##### fromRunId

> `readonly` **fromRunId**: `string`

<a id="idempotencykey-4"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

<a id="inreplyto-1"></a>

##### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

<a id="messageid-2"></a>

##### messageId?

> `readonly` `optional` **messageId?**: `string`

<a id="metadata-3"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

<a id="policy-1"></a>

##### policy?

> `readonly` `optional` **policy?**: `"steer"` \| `"interrupt"` \| `"rollback"` \| `"reject"`

<a id="prompt-3"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

<a id="to-1"></a>

##### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

***

<a id="service"></a>

### Service

Runtime operations that persist and observe product-facing Sessions.

#### Extends

- [`RuntimeHostSessions`](./HostSession.md#runtimehostsessions)

#### Properties

<a id="acknowledge"></a>

##### acknowledge

> `readonly` **acknowledge**: (`input`) => `Effect`\<`void`, [`AckError`](#ackerror)\>

Durably advance the host processed-through point to an exact committed model cycle.

###### Parameters

###### input

###### runId

`string`

###### sequence

`number`

###### Returns

`Effect`\<`void`, [`AckError`](#ackerror)\>

<a id="acknowledged"></a>

##### acknowledged

> `readonly` **acknowledged**: (`runId`) => `Effect`\<\{ `acknowledgedAt?`: `string`; `runId`: `string`; `sequence`: `number`; \}, [`InspectError`](#inspecterror)\>

Read the durable host processed-through point; -1 means no cycle is acknowledged.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `acknowledgedAt?`: `string`; `runId`: `string`; `sequence`: `number`; \}, [`InspectError`](#inspecterror)\>

<a id="activate"></a>

##### activate

> `readonly` **activate**: (`input`) => `Effect`\<[`RunInspection`](./Run.md#runinspection), [`ActivateError`](#activateerror)\>

Idempotently activate an admitted root and return its authoritative current state.

###### Parameters

###### input

[`ActivateInput`](#activateinput)

###### Returns

`Effect`\<[`RunInspection`](./Run.md#runinspection), [`ActivateError`](#activateerror)\>

<a id="admit"></a>

##### admit

> `readonly` **admit**: (`input`) => `Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`StartExecutionError`](#startexecutionerror)\>

Durably admit one exact root without making it executable.

###### Parameters

###### input

[`AdmitInput`](#admitinput)

###### Returns

`Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`StartExecutionError`](#startexecutionerror)\>

<a id="awaitchildsettlement"></a>

##### awaitChildSettlement

> `readonly` **awaitChildSettlement**: (`input`) => `Effect`\<\{ `_tag`: `"ChildSettlement"`; `admittedAtMillis`: `number`; `childRunId`: `string`; `joined?`: `boolean`; `notificationId`: `string`; `parentRunId`: `string`; `resultBytes`: `number`; `resultText`: `string`; `resultTruncated`: `boolean`; `sequence`: `number`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"`; `terminalEventId`: `string`; \}, [`ChildSettlementError`](#childsettlementerror)\>

Wait for one child's durable settlement without executing or scheduling the parent.

###### Parameters

###### input

[`AwaitChildSettlementInput`](#awaitchildsettlementinput)

###### Returns

`Effect`\<\{ `_tag`: `"ChildSettlement"`; `admittedAtMillis`: `number`; `childRunId`: `string`; `joined?`: `boolean`; `notificationId`: `string`; `parentRunId`: `string`; `resultBytes`: `number`; `resultText`: `string`; `resultTruncated`: `boolean`; `sequence`: `number`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"`; `terminalEventId`: `string`; \}, [`ChildSettlementError`](#childsettlementerror)\>

<a id="awaitfanout"></a>

##### awaitFanOut

> `readonly` **awaitFanOut**: (`fanOutId`) => `Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"request-cancel"` \| `"terminate"` \| `"abandon"`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"running"`; \}, `AwaitFanOutError`\>

###### Parameters

###### fanOutId

`string`

###### Returns

`Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"request-cancel"` \| `"terminate"` \| `"abandon"`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"running"`; \}, `AwaitFanOutError`\>

<a id="awaitsessionterminal"></a>

##### awaitSessionTerminal

> `readonly` **awaitSessionTerminal**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### input

[`AwaitSessionTerminalInput`](#awaitsessionterminalinput)

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="cancel"></a>

##### cancel

> `readonly` **cancel**: (`input`) => `Effect`\<`void`, [`CancelError`](#cancelerror)\>

Durably admit cancellation and request interruption from a process-local owner.
Successful return does not acknowledge terminal cancellation. Observe Run state or events when
the caller must know whether owned work exited and external outcomes became definitive.

###### Parameters

###### input

[`CancelInput`](#cancelinput)

###### Returns

`Effect`\<`void`, [`CancelError`](#cancelerror)\>

<a id="cancelsession"></a>

##### cancelSession

> `readonly` **cancelSession**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### input

[`CancelSessionInput`](#cancelsessioninput)

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="childsettlementchanges"></a>

##### childSettlementChanges

> `readonly` **childSettlementChanges**: (`input`) => `Stream`\<\{ `_tag`: `"ChildSettlement"`; `admittedAtMillis`: `number`; `childRunId`: `string`; `joined?`: `boolean`; `notificationId`: `string`; `parentRunId`: `string`; `resultBytes`: `number`; `resultText`: `string`; `resultTruncated`: `boolean`; `sequence`: `number`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"`; `terminalEventId`: `string`; \}, [`ChildSettlementError`](#childsettlementerror)\>

Subscribe to durable child settlements, replaying entries after the requested sequence.

###### Parameters

###### input

[`ChildSettlementChangesInput`](#childsettlementchangesinput)

###### Returns

`Stream`\<\{ `_tag`: `"ChildSettlement"`; `admittedAtMillis`: `number`; `childRunId`: `string`; `joined?`: `boolean`; `notificationId`: `string`; `parentRunId`: `string`; `resultBytes`: `number`; `resultText`: `string`; `resultTruncated`: `boolean`; `sequence`: `number`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"`; `terminalEventId`: `string`; \}, [`ChildSettlementError`](#childsettlementerror)\>

<a id="childsettlements"></a>

##### childSettlements

> `readonly` **childSettlements**: (`input`) => `Effect`\<readonly `object`[], [`ChildSettlementError`](#childsettlementerror)\>

Read ordered durable child settlements for one exact parent Run.

###### Parameters

###### input

[`ChildSettlementsInput`](#childsettlementsinput)

###### Returns

`Effect`\<readonly `object`[], [`ChildSettlementError`](#childsettlementerror)\>

<a id="configuredelegationpolicy"></a>

##### configureDelegationPolicy

> `readonly` **configureDelegationPolicy**: (`policy`) => `Effect`\<\{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`TreePolicyInvalid`](./Errors.md#treepolicyinvalid)\>

###### Parameters

###### policy

###### concurrency

\{ `agents`: `number`; `tools`: `number`; \}

###### concurrency.agents

`number`

###### concurrency.tools

`number`

###### maxDepth

`number`

###### maxSessions

`number`

###### Returns

`Effect`\<\{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`TreePolicyInvalid`](./Errors.md#treepolicyinvalid)\>

<a id="createsession"></a>

##### createSession

> `readonly` **createSession**: (`input`) => `Effect`\<[`HostSession`](../../host.md#hostsession-1), [`CreateSessionError`](./HostSession.md#createsessionerror)\>

###### Parameters

###### input

[`CreateSessionInput`](./HostSession.md#createsessioninput)

###### Returns

`Effect`\<[`HostSession`](../../host.md#hostsession-1), [`CreateSessionError`](./HostSession.md#createsessionerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`createSession`](./HostSession.md#createsession)

<a id="directory"></a>

##### directory

> `readonly` **directory**: (`runId`) => `Effect`\<readonly [`DirectoryEntry`](./AgentDirectory.md#directoryentry)[], [`DirectoryError`](#directoryerror)\>

Addresses this Run may reach under Generalist relationships plus host policy.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<readonly [`DirectoryEntry`](./AgentDirectory.md#directoryentry)[], [`DirectoryError`](#directoryerror)\>

<a id="events-1"></a>

##### events

> `readonly` **events**: (`input`) => `Stream`\<[`RunEvent`](./RunEvent.md#runevent), [`EventsError`](#eventserror)\>

###### Parameters

###### input

[`EventsInput`](#eventsinput)

###### Returns

`Stream`\<[`RunEvent`](./RunEvent.md#runevent), [`EventsError`](#eventserror)\>

<a id="extendbudget-1"></a>

##### extendBudget

> `readonly` **extendBudget**: (`input`) => `Effect`\<`void`, [`ExtendBudgetError`](#extendbudgeterror)\>

Primitive used by the operator API to journal a budget top-up and resume budget suspension.

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<`void`, [`ExtendBudgetError`](#extendbudgeterror)\>

<a id="fanout"></a>

##### fanOut

> `readonly` **fanOut**: (`input`) => `Effect`\<\{ `childRunIds`: readonly `string`[]; `duplicate`: `boolean`; `fanOutId`: `string`; `parentRunId`: `string`; \}, [`FanOutError`](#fanouterror)\>

###### Parameters

###### input

[`FanOutInput`](#fanoutinput)

###### Returns

`Effect`\<\{ `childRunIds`: readonly `string`[]; `duplicate`: `boolean`; `fanOutId`: `string`; `parentRunId`: `string`; \}, [`FanOutError`](#fanouterror)\>

<a id="fork"></a>

##### fork

> `readonly` **fork**: (`runId`, `options`) => `Effect`\<[`RunHandle`](#runhandle)\<`unknown`\>, `ForkError`\>

Start a new Run from one committed journal prefix.

###### Parameters

###### runId

`string`

###### options

[`ForkOptions`](./Fork.md#forkoptions)

###### Returns

`Effect`\<[`RunHandle`](#runhandle)\<`unknown`\>, `ForkError`\>

<a id="getrun"></a>

##### getRun

> `readonly` **getRun**: (`runId`) => `Effect`\<[`RunHandle`](#runhandle)\<`unknown`\>, [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunHandle`](#runhandle)\<`unknown`\>, [`InspectError`](#inspecterror)\>

<a id="history"></a>

##### history

> `readonly` **history**: (`input`) => `Effect`\<readonly [`RunEvent`](./RunEvent.md#runevent)[], [`EventsError`](#eventserror)\>

###### Parameters

###### input

[`HistoryInput`](#historyinput)

###### Returns

`Effect`\<readonly [`RunEvent`](./RunEvent.md#runevent)[], [`EventsError`](#eventserror)\>

<a id="inspect"></a>

##### inspect

> `readonly` **inspect**: (`runId`) => `Effect`\<[`RuntimeInspection`](#runtimeinspection), [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RuntimeInspection`](#runtimeinspection), [`InspectError`](#inspecterror)\>

<a id="inspectfanout"></a>

##### inspectFanOut

> `readonly` **inspectFanOut**: (`fanOutId`) => `Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"request-cancel"` \| `"terminate"` \| `"abandon"`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"running"`; \}, [`InspectFanOutError`](#inspectfanouterror)\>

###### Parameters

###### fanOutId

`string`

###### Returns

`Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"request-cancel"` \| `"terminate"` \| `"abandon"`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"running"`; \}, [`InspectFanOutError`](#inspectfanouterror)\>

<a id="list"></a>

##### list

> `readonly` **list**: (`input`) => `Effect`\<readonly [`RunInspection`](./Run.md#runinspection)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### input

[`ListInput`](#listinput)

###### Returns

`Effect`\<readonly [`RunInspection`](./Run.md#runinspection)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="listsessions"></a>

##### listSessions

> `readonly` **listSessions**: `Effect`\<readonly [`HostSession`](../../host.md#hostsession-1)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`listSessions`](./HostSession.md#listsessions)

<a id="messages"></a>

##### messages

> `readonly` **messages**: (`input`) => `Effect`\<readonly [`MailboxEntry`](./Mailbox.md#mailboxentry)[], [`DirectoryError`](#directoryerror)\>

Pending addressed-message projections for this exact Run.

###### Parameters

###### input

[`MessagesInput`](#messagesinput)

###### Returns

`Effect`\<readonly [`MailboxEntry`](./Mailbox.md#mailboxentry)[], [`DirectoryError`](#directoryerror)\>

<a id="operator"></a>

##### operator

> `readonly` **operator**: [`OperatorService`](#operatorservice)

<a id="previewauthority"></a>

##### previewAuthority

> `readonly` **previewAuthority**: (`runId`) => `Effect`\<`number` \| `undefined`\>

**`Internal`**

Read the storage-issued fence currently authorized to publish live previews.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`number` \| `undefined`\>

<a id="previews"></a>

##### previews

> `readonly` **previews**: (`input`) => `Stream`\<\{ `_tag`: `"ModelPreview"`; `attempt`: `number`; `attemptFence`: `number`; `changes`: readonly \[\{ `channel`: `"text"` \| `"reasoning"`; `delta`: `string`; `offset`: `number`; \}, \{ `channel`: `"text"` \| `"reasoning"`; `delta`: `string`; `offset`: `number`; \}\]; `generation`: `number`; `modelAttemptId`: `string`; `modelCallId`: `string`; `runId`: `string`; `sequence`: `number`; `turn`: `number`; \} \| \{ `attemptFence`: `number`; `generation`: `number`; `runId`: `string`; \}\>

Observe the memory-only live preview lane for one Run.
Frames contain bounded UTF-16 appends with per-attempt sequences and per-channel offsets.
Subscribers may lose frames without blocking execution and detect that loss from the next
frame. Preview events are memory-only and never durable RunEvents.

###### Parameters

###### input

[`PreviewsInput`](#previewsinput)

###### Returns

`Stream`\<\{ `_tag`: `"ModelPreview"`; `attempt`: `number`; `attemptFence`: `number`; `changes`: readonly \[\{ `channel`: `"text"` \| `"reasoning"`; `delta`: `string`; `offset`: `number`; \}, \{ `channel`: `"text"` \| `"reasoning"`; `delta`: `string`; `offset`: `number`; \}\]; `generation`: `number`; `modelAttemptId`: `string`; `modelCallId`: `string`; `runId`: `string`; `sequence`: `number`; `turn`: `number`; \} \| \{ `attemptFence`: `number`; `generation`: `number`; `runId`: `string`; \}\>

<a id="recordreward"></a>

##### recordReward

> `readonly` **recordReward**: (`input`) => `Effect`\<`void`, `RecordRewardError`\>

**`Internal`**

Journal one scalar reward assigned by an export policy.

###### Parameters

###### input

[`RewardInput`](./RunEvent.md#rewardinput) & `CommandIdentity`

###### Returns

`Effect`\<`void`, `RecordRewardError`\>

<a id="register"></a>

##### register

> `readonly` **register**: \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputCodec`, `OutputCodec`\>(`agent`) => `Effect`\<`void`, [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid) \| [`DuplicateAgent`](./Errors.md#duplicateagent), [`ClosedServices`](../../generalist/namespaces/Agent.md#closedservices)\<`Tools`, `R`, `InputCodec`, `OutputCodec`\>\>

Register one Agent name and its exact environment for start and recovery.

###### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

###### InputCodec

`InputCodec` *extends* `Top`

###### OutputCodec

`OutputCodec` *extends* `Top`

###### Parameters

###### agent

[`Agent`](../../generalist/namespaces/Agent.md#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputCodec`, `OutputCodec`\>

###### Returns

`Effect`\<`void`, [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid) \| [`DuplicateAgent`](./Errors.md#duplicateagent), [`ClosedServices`](../../generalist/namespaces/Agent.md#closedservices)\<`Tools`, `R`, `InputCodec`, `OutputCodec`\>\>

<a id="registeragentname"></a>

##### registerAgentName

> `readonly` **registerAgentName**: (`input`) => `Effect`\<[`DirectoryEntry`](./AgentDirectory.md#directoryentry), [`RegisterAgentNameError`](#registeragentnameerror)\>

Bind one host-assigned name, unique within the Run's naming scope.

###### Parameters

###### input

[`RegisterAgentNameInput`](#registeragentnameinput)

###### Returns

`Effect`\<[`DirectoryEntry`](./AgentDirectory.md#directoryentry), [`RegisterAgentNameError`](#registeragentnameerror)\>

<a id="removesessioninput"></a>

##### removeSessionInput

> `readonly` **removeSessionInput**: (`input`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

###### Parameters

###### input

###### commandId

`string`

###### expectedRevision

`number`

###### id

`string`

###### sessionId

`string`

###### Returns

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`removeSessionInput`](./HostSession.md#removesessioninput)

<a id="resolvemodelresponse"></a>

##### resolveModelResponse

> `readonly` **resolveModelResponse**: (`event`) => `Effect`\<\{ `content`: readonly (\{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"reasoning"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `approvalId`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `toolCallId`: `string`; `type`: `"tool-approval-request"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `data`: `Uint8Array`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"file"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `fileName?`: `string`; `id`: `string`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"document"`; `title`: `string`; `type`: `"source"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"url"`; `title`: `string`; `type`: `"source"`; `url`: `URL`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id?`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `modelId?`: `string`; `request?`: \{ \}; `timestamp?`: `Utc`; `type`: `"response-metadata"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `reason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `response?`: \{ `headers`: \{\[`key`: `string`\]: `string` \| `Redacted`\<...\>; \}; `status`: `number`; \}; `type`: `"finish"`; `usage`: `Usage`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `params`: `unknown`; `providerExecuted`: `boolean`; `type`: `"tool-call"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `encodedResult`: `unknown`; `id`: `string`; `isFailure`: `boolean`; `memoized?`: \{ `fromOperation`: `string`; `fromRun`: `string`; \}; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `preliminary`: `boolean`; `providerExecuted`: `boolean`; `result`: `unknown`; `taint?`: readonly `object`[]; `type`: `"tool-result"`; \})[]; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `usage?`: `Usage`; \}, [`SessionEntryError`](#sessionentryerror)\>

###### Parameters

###### event

[`ModelResponseEvent`](#modelresponseevent)

###### Returns

`Effect`\<\{ `content`: readonly (\{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"reasoning"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `approvalId`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `toolCallId`: `string`; `type`: `"tool-approval-request"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `data`: `Uint8Array`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"file"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `fileName?`: `string`; `id`: `string`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"document"`; `title`: `string`; `type`: `"source"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"url"`; `title`: `string`; `type`: `"source"`; `url`: `URL`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id?`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `modelId?`: `string`; `request?`: \{ \}; `timestamp?`: `Utc`; `type`: `"response-metadata"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `reason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `response?`: \{ `headers`: \{\[`key`: `string`\]: `string` \| `Redacted`\<...\>; \}; `status`: `number`; \}; `type`: `"finish"`; `usage`: `Usage`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `params`: `unknown`; `providerExecuted`: `boolean`; `type`: `"tool-call"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `encodedResult`: `unknown`; `id`: `string`; `isFailure`: `boolean`; `memoized?`: \{ `fromOperation`: `string`; `fromRun`: `string`; \}; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `preliminary`: `boolean`; `providerExecuted`: `boolean`; `result`: `unknown`; `taint?`: readonly `object`[]; `type`: `"tool-result"`; \})[]; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `usage?`: `Usage`; \}, [`SessionEntryError`](#sessionentryerror)\>

<a id="resolveoperation"></a>

##### resolveOperation

> `readonly` **resolveOperation**: (`input`) => `Effect`\<`void`, `ResolveOperationError`\>

###### Parameters

###### input

###### idempotencyKey

`string`

###### operationId

`string`

###### resolution

\{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}

###### runId

`string`

###### Returns

`Effect`\<`void`, `ResolveOperationError`\>

<a id="respond"></a>

##### respond

> `readonly` **respond**: (`input`) => `Effect`\<`void`, [`RespondError`](#responderror)\>

###### Parameters

###### input

[`RespondInput`](#respondinput)

###### Returns

`Effect`\<`void`, [`RespondError`](#responderror)\>

<a id="respondapproval"></a>

##### respondApproval

> `readonly` **respondApproval**: (`input`) => `Effect`\<`void`, [`RespondApprovalError`](#respondapprovalerror)\>

###### Parameters

###### input

###### approvalId

`string`

###### decision

\{ \} \| \{ `reason?`: `string`; \}

###### operator?

`string`

###### runId

`string`

###### Returns

`Effect`\<`void`, [`RespondApprovalError`](#respondapprovalerror)\>

<a id="rewind"></a>

##### rewind

> `readonly` **rewind**: (`runId`, `options`) => `Effect`\<`void`, `RewindError`\>

Continue this Run from an earlier prefix while retaining its old suffix as a branch.

###### Parameters

###### runId

`string`

###### options

[`RewindOptions`](./Fork.md#rewindoptions)

###### Returns

`Effect`\<`void`, `RewindError`\>

<a id="schedule"></a>

##### schedule

> `readonly` **schedule**: \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputCodec`, `OutputCodec`\>(`agent`, `input`, `options`) => `Effect`\<\{ `nextAt`: `string`; `scheduleId`: `string`; \}, [`ScheduleError`](#scheduleerror)\>

Register recurring fresh Runs for one registered Agent.

###### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

###### InputCodec

`InputCodec` *extends* `Top`

###### OutputCodec

`OutputCodec` *extends* `Top`

###### Parameters

###### agent

[`Agent`](../../generalist/namespaces/Agent.md#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputCodec`, `OutputCodec`\>

###### input

`InputCodec`\[`"Type"`\]

###### options

[`ScheduleOptions`](#scheduleoptions)

###### Returns

`Effect`\<\{ `nextAt`: `string`; `scheduleId`: `string`; \}, [`ScheduleError`](#scheduleerror)\>

<a id="send-1"></a>

##### send

> `readonly` **send**: `SendFunction`

<a id="sendmessage"></a>

##### sendMessage

> `readonly` **sendMessage**: (`input`) => `Effect`\<[`MessageReceipt`](./Mailbox.md#messagereceipt), [`SendMessageError`](#sendmessageerror)\>

Send one addressed message into the target's durable inbox.

Authorization is relationship-scoped from authoritative identity plus the host policy seam.
Address resolution selects one exact target Run before unified inbox admission.

###### Parameters

###### input

[`SendMessageInput`](#sendmessageinput)

###### Returns

`Effect`\<[`MessageReceipt`](./Mailbox.md#messagereceipt), [`SendMessageError`](#sendmessageerror)\>

<a id="session"></a>

##### session

> `readonly` **session**: (`sessionId`) => `Effect`\<[`HostSession`](../../host.md#hostsession-1), [`SessionError`](./HostSession.md#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<[`HostSession`](../../host.md#hostsession-1), [`SessionError`](./HostSession.md#sessionerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`session`](./HostSession.md#session-1)

<a id="sessionentry"></a>

##### sessionEntry

> `readonly` **sessionEntry**: (`input`) => `Effect`\<[`Entry`](../../generalist/namespaces/Session.md#entry-1), [`SessionEntryError`](#sessionentryerror)\>

###### Parameters

###### input

[`SessionEntryInput`](#sessionentryinput)

###### Returns

`Effect`\<[`Entry`](../../generalist/namespaces/Session.md#entry-1), [`SessionEntryError`](#sessionentryerror)\>

<a id="sessionevents"></a>

##### sessionEvents

> `readonly` **sessionEvents**: (`input`) => `Stream`\<\{ `cursor`: `number`; `event`: [`RunEvent`](./RunEvent.md#runevent); \} \| \{ `cursor`: `number`; `update`: \{ `afterEntryId`: `string` \| `null`; `entries`: readonly `ConversationEntry`[]; `leafId`: `string` \| `null`; `nextLeafId?`: `string`; `previousLeafId`: `string` \| `null`; `reset?`: `true`; \}; \}, [`SessionEventsError`](./HostSession.md#sessioneventserror)\>

###### Parameters

###### input

[`SessionEventsInput`](./HostSession.md#sessioneventsinput)

###### Returns

`Stream`\<\{ `cursor`: `number`; `event`: [`RunEvent`](./RunEvent.md#runevent); \} \| \{ `cursor`: `number`; `update`: \{ `afterEntryId`: `string` \| `null`; `entries`: readonly `ConversationEntry`[]; `leafId`: `string` \| `null`; `nextLeafId?`: `string`; `previousLeafId`: `string` \| `null`; `reset?`: `true`; \}; \}, [`SessionEventsError`](./HostSession.md#sessioneventserror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`sessionEvents`](./HostSession.md#sessionevents)

<a id="sessionfamily"></a>

##### sessionFamily

> `readonly` **sessionFamily**: (`sessionId`, `input`) => `Effect`\<\{ `at`: `number`; `nextBefore`: `number` \| `null`; `rootSessionId`: `string`; `sessions`: readonly `object`[]; \}, [`SessionError`](./HostSession.md#sessionerror) \| [`SessionPageInvalid`](../../host.md#sessionpageinvalid)\>

###### Parameters

###### sessionId

`string`

###### input

###### at?

`number`

###### before?

`number`

###### limit

`number`

###### Returns

`Effect`\<\{ `at`: `number`; `nextBefore`: `number` \| `null`; `rootSessionId`: `string`; `sessions`: readonly `object`[]; \}, [`SessionError`](./HostSession.md#sessionerror) \| [`SessionPageInvalid`](../../host.md#sessionpageinvalid)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`sessionFamily`](./HostSession.md#sessionfamily)

<a id="sessionhistorypage"></a>

##### sessionHistoryPage

> `readonly` **sessionHistoryPage**: (`sessionId`, `input`) => `Effect`\<[`SessionHistoryPage`](../../host.md#sessionhistorypage), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

###### Parameters

###### sessionId

`string`

###### input

###### leafId

`string` \| `null`

###### limit

`number`

###### Returns

`Effect`\<[`SessionHistoryPage`](../../host.md#sessionhistorypage), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`sessionHistoryPage`](./HostSession.md#sessionhistorypage)

<a id="sessionruns"></a>

##### sessionRuns

> `readonly` **sessionRuns**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./Run.md#runinspection)[], [`SessionError`](./HostSession.md#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run.md#runinspection)[], [`SessionError`](./HostSession.md#sessionerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`sessionRuns`](./HostSession.md#sessionruns)

<a id="sessionrunspage"></a>

##### sessionRunsPage

> `readonly` **sessionRunsPage**: (`sessionId`, `input`) => `Effect`\<[`SessionRunsPage`](../../host.md#sessionrunspage), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

###### Parameters

###### sessionId

`string`

###### input

###### at

`number`

###### before?

`number`

###### limit

`number`

###### rootRunId?

`string`

###### Returns

`Effect`\<[`SessionRunsPage`](../../host.md#sessionrunspage), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`sessionRunsPage`](./HostSession.md#sessionrunspage)

<a id="sessionrunsummary"></a>

##### sessionRunSummary

> `readonly` **sessionRunSummary**: (`sessionId`, `runId`) => `Effect`\<[`SessionRunSummary`](../../host.md#sessionrunsummary), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

###### Parameters

###### sessionId

`string`

###### runId

`string`

###### Returns

`Effect`\<[`SessionRunSummary`](../../host.md#sessionrunsummary), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`sessionRunSummary`](./HostSession.md#sessionrunsummary)

<a id="sessionselection"></a>

##### sessionSelection

> `readonly` **sessionSelection**: (`name`) => `Effect`\<\{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}; \}, [`UnknownAgent`](./Errors.md#unknownagent)\>

###### Parameters

###### name

`string`

###### Returns

`Effect`\<\{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}; \}, [`UnknownAgent`](./Errors.md#unknownagent)\>

<a id="sessionsnapshot"></a>

##### sessionSnapshot

> `readonly` **sessionSnapshot**: (`sessionId`) => `Effect`\<[`HostSessionSnapshot`](./HostSession.md#hostsessionsnapshot), [`SessionSnapshotError`](./HostSession.md#sessionsnapshoterror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<[`HostSessionSnapshot`](./HostSession.md#hostsessionsnapshot), [`SessionSnapshotError`](./HostSession.md#sessionsnapshoterror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`sessionSnapshot`](./HostSession.md#sessionsnapshot)

<a id="signal"></a>

##### signal

> `readonly` **signal**: (`input`) => `Effect`\<`void`, [`SignalError`](#signalerror)\>

###### Parameters

###### input

[`SignalInput`](#signalinput)

###### Returns

`Effect`\<`void`, [`SignalError`](#signalerror)\>

<a id="snapshot"></a>

##### snapshot

> `readonly` **snapshot**: (`runId`) => `Effect`\<[`RunSnapshot`](./Run.md#runsnapshot), [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunSnapshot`](./Run.md#runsnapshot), [`InspectError`](#inspecterror)\>

<a id="spawn"></a>

##### spawn

> `readonly` **spawn**: (`input`) => `Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`SpawnError`](#spawnerror)\>

###### Parameters

###### input

[`SpawnInput`](#spawninput)

###### Returns

`Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`SpawnError`](#spawnerror)\>

<a id="start"></a>

##### start

> `readonly` **start**: \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputCodec`, `OutputCodec`\>(`agent`, `input`, `options?`) => `Effect`\<[`RunHandle`](#runhandle)\<`OutputCodec`\[`"Type"`\]\>, [`StartError`](#starterror), `never`\>

Start one registered Agent with Schema-derived input and output.

###### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

###### InputCodec

`InputCodec` *extends* `Top`

###### OutputCodec

`OutputCodec` *extends* `Top`

###### Parameters

###### agent

[`Agent`](../../generalist/namespaces/Agent.md#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputCodec`, `OutputCodec`\>

###### input

`InputCodec`\[`"Type"`\]

###### options?

[`StartOptions`](../../generalist/namespaces/Agent.md#startoptions)

###### Returns

`Effect`\<[`RunHandle`](#runhandle)\<`OutputCodec`\[`"Type"`\]\>, [`StartError`](#starterror), `never`\>

<a id="startexecution"></a>

##### startExecution

> `readonly` **startExecution**: (`input`) => `Effect`\<[`StartReceipt`](#startreceipt), [`StartExecutionError`](#startexecutionerror)\>

**`Internal`**

Begin one already-normalized pinned execution.

###### Parameters

###### input

[`StartExecutionInput`](#startexecutioninput)

###### Returns

`Effect`\<[`StartReceipt`](#startreceipt), [`StartExecutionError`](#startexecutionerror)\>

<a id="submitsessioninput"></a>

##### submitSessionInput

> `readonly` **submitSessionInput**: (`input`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

###### Parameters

###### input

###### commandId

`string`

###### prompt

`Prompt`

###### selection?

\{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}; \}

###### selection.budget?

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### selection.budget.children?

`number`

###### selection.budget.duration?

`number`

###### selection.budget.tokens?

`number`

###### selection.budget.toolCalls?

`number`

###### selection.budget.usd?

`number`

###### selection.executableManifest

[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### selection.executableRef

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### selection.executableRef.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### selection.executableRef.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### selection.registrations

readonly `object`[]

###### selection.treePolicy?

\{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}

###### selection.treePolicy.concurrency

\{ `agents`: `number`; `tools`: `number`; \}

###### selection.treePolicy.concurrency.agents

`number`

###### selection.treePolicy.concurrency.tools

`number`

###### selection.treePolicy.maxDepth

`number`

###### selection.treePolicy.maxSessions

`number`

###### sessionId

`string`

###### Returns

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`submitSessionInput`](./HostSession.md#submitsessioninput)

<a id="treechanges"></a>

##### treeChanges

> `readonly` **treeChanges**: (`rootRunId`) => `Stream`\<`void`, [`TreeReplayError`](#treereplayerror)\>

###### Parameters

###### rootRunId

`string`

###### Returns

`Stream`\<`void`, [`TreeReplayError`](#treereplayerror)\>

<a id="treecheckpoint"></a>

##### treeCheckpoint

> `readonly` **treeCheckpoint**: (`rootRunId`) => `Effect`\<[`Checkpoint`](./RunTree.md#checkpoint), [`InspectError`](#inspecterror)\>

Atomically pair a point-in-time tree inspection with its exclusive replay cursor.

###### Parameters

###### rootRunId

`string`

###### Returns

`Effect`\<[`Checkpoint`](./RunTree.md#checkpoint), [`InspectError`](#inspecterror)\>

<a id="treereplay"></a>

##### treeReplay

> `readonly` **treeReplay**: (`input`) => `Effect`\<[`ReplayPage`](./RunTree.md#replaypage), [`TreeReplayError`](#treereplayerror)\>

Read one bounded, ordered page strictly after an opaque root-bound cursor.

###### Parameters

###### input

[`ReplayInput`](./RunTree.md#replayinput)

###### Returns

`Effect`\<[`ReplayPage`](./RunTree.md#replaypage), [`TreeReplayError`](#treereplayerror)\>

<a id="updatesessioninput"></a>

##### updateSessionInput

> `readonly` **updateSessionInput**: (`input`, `resolveSelection?`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`UnknownAgent`](./Errors.md#unknownagent) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

###### Parameters

###### input

###### agent?

`string`

###### commandId

`string`

###### expectedRevision

`number`

###### id

`string`

###### prompt

`Prompt`

###### selection?

\{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}; \}

###### selection.budget?

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### selection.budget.children?

`number`

###### selection.budget.duration?

`number`

###### selection.budget.tokens?

`number`

###### selection.budget.toolCalls?

`number`

###### selection.budget.usd?

`number`

###### selection.executableManifest

[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### selection.executableRef

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### selection.executableRef.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### selection.executableRef.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### selection.registrations

readonly `object`[]

###### selection.treePolicy?

\{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}

###### selection.treePolicy.concurrency

\{ `agents`: `number`; `tools`: `number`; \}

###### selection.treePolicy.concurrency.agents

`number`

###### selection.treePolicy.concurrency.tools

`number`

###### selection.treePolicy.maxDepth

`number`

###### selection.treePolicy.maxSessions

`number`

###### sessionId

`string`

###### resolveSelection?

[`SelectionResolver`](./SessionQueue.md#selectionresolver)

###### Returns

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`UnknownAgent`](./Errors.md#unknownagent) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession.md#runtimehostsessions).[`updateSessionInput`](./HostSession.md#updatesessioninput)

<a id="wake-1"></a>

##### wake

> `readonly` **wake**: (`input`) => `Effect`\<\{ `waitId`: `string`; \} \| \{ \} \| \{ \}, [`WakeError`](#wakeerror)\>

Journal one validated environmental event and resume one matching wait at most once.

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<\{ `waitId`: `string`; \} \| \{ \} \| \{ \}, [`WakeError`](#wakeerror)\>

***

<a id="sessionentryinput"></a>

### SessionEntryInput

#### Properties

<a id="entryid"></a>

##### entryId

> `readonly` **entryId**: `string`

<a id="sessionid-6"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="signalinput"></a>

### SignalInput

#### Extends

- `CommandIdentity`

#### Properties

<a id="commandid-3"></a>

##### commandId

> `readonly` **commandId**: `string`

###### Inherited from

`CommandIdentity.commandId`

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

<a id="payload"></a>

##### payload?

> `readonly` `optional` **payload?**: `unknown`

<a id="runid-11"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="spawninput"></a>

### SpawnInput

#### Properties

<a id="correlationid-3"></a>

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

<a id="idempotencykey-5"></a>

##### idempotencyKey?

> `readonly` `optional` **idempotencyKey?**: `string`

<a id="invocationid-1"></a>

##### invocationId

> `readonly` **invocationId**: `string`

<a id="label-1"></a>

##### label?

> `readonly` `optional` **label?**: `string`

<a id="messageid-3"></a>

##### messageId?

> `readonly` `optional` **messageId?**: `string`

<a id="metadata-4"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

<a id="origin-1"></a>

##### origin?

> `readonly` `optional` **origin?**: `object`

###### operationKey?

> `readonly` `optional` **operationKey?**: `string`

###### parentToolCallId?

> `readonly` `optional` **parentToolCallId?**: `string`

<a id="parentrunid-5"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

<a id="prompt-4"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

<a id="selection-2"></a>

##### selection

> `readonly` **selection**: `string`

<a id="sessionid-7"></a>

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

***

<a id="startexecutioninput"></a>

### StartExecutionInput

**`Internal`**

Exact root execution admission used below the typed Agent API.

#### Properties

<a id="budget-2"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### allocation

> `readonly` **allocation**: `object`

###### allocation.children?

> `readonly` `optional` **children?**: `number`

###### allocation.duration?

> `readonly` `optional` **duration?**: `number`

###### allocation.tokens?

> `readonly` `optional` **tokens?**: `number`

###### allocation.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### allocation.usd?

> `readonly` `optional` **usd?**: `number`

###### remaining

> `readonly` **remaining**: `object`

###### remaining.children?

> `readonly` `optional` **children?**: `number`

###### remaining.duration?

> `readonly` `optional` **duration?**: `number`

###### remaining.tokens?

> `readonly` `optional` **tokens?**: `number`

###### remaining.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### remaining.usd?

> `readonly` `optional` **usd?**: `number`

<a id="causationid-2"></a>

##### causationId?

> `readonly` `optional` **causationId?**: `string`

<a id="correlationid-4"></a>

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

<a id="executable-1"></a>

##### executable

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest.md#pinnedexecutable)

<a id="idempotencykey-6"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

<a id="initialchildren"></a>

##### initialChildren?

> `readonly` `optional` **initialChildren?**: readonly [`InitialChildInput`](#initialchildinput)[]

<a id="initialfanouts"></a>

##### initialFanOuts?

> `readonly` `optional` **initialFanOuts?**: readonly `InitialFanOutInput`[]

<a id="messageid-4"></a>

##### messageId?

> `readonly` `optional` **messageId?**: `string`

<a id="metadata-5"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

<a id="prompt-5"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

<a id="registrations-1"></a>

##### registrations

> `readonly` **registrations**: readonly `object`[]

<a id="runid-12"></a>

##### runId?

> `readonly` `optional` **runId?**: `string`

<a id="sessionid-8"></a>

##### sessionId

> `readonly` **sessionId**: `string`

<a id="treepolicy-2"></a>

##### treePolicy?

> `readonly` `optional` **treePolicy?**: `object`

###### concurrency

> `readonly` **concurrency**: `object`

###### concurrency.agents

> `readonly` **agents**: `number`

###### concurrency.tools

> `readonly` **tools**: `number`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSessions

> `readonly` **maxSessions**: `number`

***

<a id="startreceipt"></a>

### StartReceipt

#### Extends

- [`RunReceipt`](./Run.md#runreceipt)

#### Properties

<a id="acceptedsequence"></a>

##### acceptedSequence

> `readonly` **acceptedSequence**: `number`

###### Inherited from

[`RunReceipt`](./Run.md#runreceipt).[`acceptedSequence`](./Run.md#acceptedsequence)

<a id="childrunids"></a>

##### childRunIds

> `readonly` **childRunIds**: readonly `string`[]

<a id="duplicate"></a>

##### duplicate

> `readonly` **duplicate**: `boolean`

###### Inherited from

[`RunReceipt`](./Run.md#runreceipt).[`duplicate`](./Run.md#duplicate)

<a id="fanouts"></a>

##### fanOuts

> `readonly` **fanOuts**: readonly `object`[]

<a id="messageid-5"></a>

##### messageId

> `readonly` **messageId**: `string`

###### Inherited from

[`RunReceipt`](./Run.md#runreceipt).[`messageId`](./Run.md#messageid-1)

<a id="runid-13"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`RunReceipt`](./Run.md#runreceipt).[`runId`](./Run.md#runid-3)

## Type Aliases

<a id="ackerror"></a>

### AckError

> **AckError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`AckInvalid`](./Errors.md#ackinvalid) \| [`AckBeyondCommitted`](./Errors.md#ackbeyondcommitted) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

Durable host acknowledgement failures.

***

<a id="ackpoint"></a>

### AckPoint

> **AckPoint** = `Struct`\<\{ `acknowledgedAt`: `optionalKey`\<`String`\>; `runId`: `String`; `sequence`: `Int`; \}\>

One durable host processed-through point on the Run event sequence.

***

<a id="ackpoint-1"></a>

### AckPoint

> **AckPoint** = *typeof* `Point.Type`

One durable host processed-through point on the Run event sequence.

***

<a id="activateerror"></a>

### ActivateError

> **ActivateError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

Staged root activation failures.

***

<a id="admiterror"></a>

### AdmitError

> **AdmitError** = [`StartExecutionError`](#startexecutionerror)

Exact-root staged admission failures.

***

<a id="admitinput"></a>

### AdmitInput

> **AdmitInput** = `Omit`\<[`StartExecutionInput`](#startexecutioninput), `"initialChildren"` \| `"initialFanOuts"`\>

One exact root admission held behind Generalist's durable execution gate.

***

<a id="cancelerror"></a>

### CancelError

> **CancelError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="childsettlementerror"></a>

### ChildSettlementError

> **ChildSettlementError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="directoryerror"></a>

### DirectoryError

> **DirectoryError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="eventserror"></a>

### EventsError

> **EventsError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`CursorExpired`](./Errors.md#cursorexpired) \| [`HistoryLimitInvalid`](./Errors.md#historylimitinvalid) \| [`SubscriberLagged`](./Errors.md#subscriberlagged) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="extendbudgeterror"></a>

### ExtendBudgetError

> **ExtendBudgetError** = [`InspectError`](#inspecterror) \| [`Invalid`](../../generalist/namespaces/RunBudget.md#invalid)

***

<a id="fanouterror"></a>

### FanOutError

> **FanOutError** = [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`FanOutConflict`](./Errors.md#fanoutconflict) \| [`FanOutInvalid`](./Errors.md#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./Errors.md#fanoutremainderunsupported) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted)

***

<a id="inspecterror"></a>

### InspectError

> **InspectError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="inspectfanouterror"></a>

### InspectFanOutError

> **InspectFanOutError** = [`FanOutNotFound`](./Errors.md#fanoutnotfound) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="modelresponseevent"></a>

### ModelResponseEvent

> **ModelResponseEvent** = `Extract`\<[`RunEvent`](./RunEvent.md#runevent), \{ `_tag`: `"ModelResponseCommitted"` \| `"ModelResponseInterrupted"`; \}\>

***

<a id="operatoractionerror"></a>

### OperatorActionError

> **OperatorActionError** = [`InspectError`](#inspecterror) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)

***

<a id="operatorapprovalerror"></a>

### OperatorApprovalError

> **OperatorApprovalError** = [`ResolveError`](../../approvals.md#resolveerror) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)

***

<a id="operatorextendbudgeterror"></a>

### OperatorExtendBudgetError

> **OperatorExtendBudgetError** = [`ExtendBudgetError`](#extendbudgeterror) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)

***

<a id="registeragentnameerror"></a>

### RegisterAgentNameError

> **RegisterAgentNameError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`AgentNameConflict`](./Errors.md#agentnameconflict) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="resolvemodelresponseerror"></a>

### ResolveModelResponseError

> **ResolveModelResponseError** = [`SessionEntryError`](#sessionentryerror)

***

<a id="respondapprovalerror"></a>

### RespondApprovalError

> **RespondApprovalError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`ApprovalStale`](./Errors.md#approvalstale) \| [`ApprovalMismatch`](./Errors.md#approvalmismatch) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="responderror"></a>

### RespondError

> **RespondError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`WaitNotOpen`](./Errors.md#waitnotopen) \| [`ResponseConflict`](./Errors.md#responseconflict) \| [`RunTerminal`](./Errors.md#runterminal) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="runsenderror"></a>

### RunSendError

> **RunSendError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`RunBusy`](./Errors.md#runbusy) \| [`NotInFamily`](./Errors.md#notinfamily) \| [`SteeringConflict`](./Errors.md#steeringconflict) \| [`ForkSequenceInvalid`](./Errors.md#forksequenceinvalid) \| [`NoSnapshot`](./Errors.md#nosnapshot) \| [`Invalid`](../../generalist/namespaces/RunBudget.md#invalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`CursorExpired`](./Errors.md#cursorexpired) \| [`InboxFull`](../../generalist/namespaces/Steering.md#inboxfull) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="scheduleerror"></a>

### ScheduleError

> **ScheduleError** = [`UnknownAgent`](./Errors.md#unknownagent) \| [`AgentError`](../../generalist/namespaces/AgentEvent.md#agenterror) \| [`ScheduleInvalid`](#scheduleinvalid) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="schedulereceipt"></a>

### ScheduleReceipt

> **ScheduleReceipt** = *typeof* `ScheduleReceipt.Type`

Durable identity and first firing instant of a registered recurrence.

***

<a id="senderror"></a>

### SendError

> **SendError** = [`AddressNotFound`](./Errors.md#addressnotfound) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RunIdConflict`](./Errors.md#runidconflict) \| [`ExecutableIdentityMismatch`](./Errors.md#executableidentitymismatch) \| [`ExecutablePinMissing`](./Errors.md#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./Errors.md#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./Errors.md#executableregistrationmissing) \| [`TreePolicyInvalid`](./Errors.md#treepolicyinvalid) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="sendmessageerror"></a>

### SendMessageError

> **SendMessageError** = [`AddressNotFound`](./Errors.md#addressnotfound) \| [`AddressInvalid`](./AgentDirectory.md#addressinvalid) \| [`NotInFamily`](./Errors.md#notinfamily) \| [`RunTerminal`](./Errors.md#runterminal) \| [`RunBusy`](./Errors.md#runbusy) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`SteeringConflict`](./Errors.md#steeringconflict) \| [`ForkSequenceInvalid`](./Errors.md#forksequenceinvalid) \| [`NoSnapshot`](./Errors.md#nosnapshot) \| [`Invalid`](../../generalist/namespaces/RunBudget.md#invalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`CursorExpired`](./Errors.md#cursorexpired) \| [`InboxFull`](../../generalist/namespaces/Steering.md#inboxfull) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="sessionentryerror"></a>

### SessionEntryError

> **SessionEntryError** = [`SessionEntryNotFound`](./Errors.md#sessionentrynotfound) \| [`SessionEntryCorrupt`](./Errors.md#sessionentrycorrupt) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="signalerror"></a>

### SignalError

> **SignalError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="spawnerror"></a>

### SpawnError

> **SpawnError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted)

***

<a id="starterror"></a>

### StartError

> **StartError** = [`StartExecutionError`](#startexecutionerror) \| [`UnknownAgent`](./Errors.md#unknownagent) \| [`AgentError`](../../generalist/namespaces/AgentEvent.md#agenterror)

Typed Agent start failures before a Run handle exists.

***

<a id="startexecutionerror"></a>

### StartExecutionError

> **StartExecutionError** = [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RunIdConflict`](./Errors.md#runidconflict) \| [`ExecutableIdentityMismatch`](./Errors.md#executableidentitymismatch) \| [`ExecutablePinMissing`](./Errors.md#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./Errors.md#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./Errors.md#executableregistrationmissing) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`StartInvalid`](./Errors.md#startinvalid) \| [`FanOutConflict`](./Errors.md#fanoutconflict) \| [`FanOutInvalid`](./Errors.md#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./Errors.md#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./Errors.md#treepolicyinvalid) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted)

***

<a id="treeeventserror"></a>

### TreeEventsError

> **TreeEventsError** = [`TreeReplayError`](#treereplayerror)

***

<a id="treereplayerror"></a>

### TreeReplayError

> **TreeReplayError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`TreeCursorInvalid`](./Errors.md#treecursorinvalid) \| [`TreeCursorRootMismatch`](./Errors.md#treecursorrootmismatch) \| [`TreeCursorExpired`](./Errors.md#treecursorexpired) \| [`TreeCursorFuture`](./Errors.md#treecursorfuture) \| [`TreeReplayLimitInvalid`](./Errors.md#treereplaylimitinvalid) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="wakedisposition"></a>

### WakeDisposition

> **WakeDisposition** = *typeof* `WakeDisposition.Type`

Result of admitting one validated wake event to a Run.

***

<a id="wakeerror"></a>

### WakeError

> **WakeError** = [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`WakeEventInvalid`](#wakeeventinvalid)

## Variables

<a id="schedulereceipt-1"></a>

### ScheduleReceipt

> `const` **ScheduleReceipt**: `Schema.Struct`\<\{ `nextAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>

Durable identity and first firing instant of a registered recurrence.

***

<a id="wakedisposition-1"></a>

### WakeDisposition

> `const` **WakeDisposition**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resumed"`, \{ `waitId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Duplicate"`, \{ \}\>, `Schema.TaggedStruct`\<`"Ignored"`, \{ \}\>\]\>

Result of admitting one validated wake event to a Run.

## References

<a id="createsessionerror"></a>

### CreateSessionError

Re-exports [CreateSessionError](./HostSession.md#createsessionerror)

***

<a id="createsessioninput"></a>

### CreateSessionInput

Re-exports [CreateSessionInput](./HostSession.md#createsessioninput)

***

<a id="hostsession"></a>

### HostSession

Re-exports [HostSession](../../host.md#hostsession-1)

***

<a id="hostsessionevent"></a>

### HostSessionEvent

Re-exports [HostSessionEvent](./HostSession.md#hostsessionevent-1)

***

<a id="layer"></a>

### layer

Re-exports [layer](../../durability.md#layer)

***

<a id="modelpreviewchange"></a>

### ModelPreviewChange

Renames and re-exports [Change](./ModelPreview.md#change-1)

***

<a id="modelpreviewcleared"></a>

### ModelPreviewCleared

Renames and re-exports [Cleared](./ModelPreview.md#cleared-1)

***

<a id="modelpreviewevent"></a>

### ModelPreviewEvent

Renames and re-exports [Event](./ModelPreview.md#event-1)

***

<a id="modelpreviewframe"></a>

### ModelPreviewFrame

Renames and re-exports [Frame](./ModelPreview.md#frame-1)

***

<a id="recoverydecision"></a>

### RecoveryDecision

Re-exports [RecoveryDecision](./Recovery.md#recoverydecision-1)

***

<a id="recoveryexplanation"></a>

### RecoveryExplanation

Renames and re-exports [Explanation](./Recovery.md#explanation-1)

***

<a id="recoveryobligation"></a>

### RecoveryObligation

Renames and re-exports [Obligation](./Recovery.md#obligation-1)

***

<a id="recoveryverification"></a>

### RecoveryVerification

Renames and re-exports [Verification](./Recovery.md#verification-1)

***

<a id="respondapprovalinput"></a>

### RespondApprovalInput

Renames and re-exports [RespondInput](./Approval.md#respondinput-1)

***

<a id="sessionconflict"></a>

### SessionConflict

Re-exports [SessionConflict](../../host.md#sessionconflict)

***

<a id="sessioncursorexpired"></a>

### SessionCursorExpired

Re-exports [SessionCursorExpired](../../host.md#sessioncursorexpired)

***

<a id="sessionerror"></a>

### SessionError

Re-exports [SessionError](./HostSession.md#sessionerror)

***

<a id="sessioneventserror"></a>

### SessionEventsError

Re-exports [SessionEventsError](./HostSession.md#sessioneventserror)

***

<a id="sessioneventsinput"></a>

### SessionEventsInput

Re-exports [SessionEventsInput](./HostSession.md#sessioneventsinput)

***

<a id="sessionnotfound"></a>

### SessionNotFound

Re-exports [SessionNotFound](../../host.md#sessionnotfound)

***

<a id="sessionsubscriberlagged"></a>

### SessionSubscriberLagged

Re-exports [SessionSubscriberLagged](../../host.md#sessionsubscriberlagged)

***

<a id="startevent"></a>

### StartEvent

Re-exports [StartEvent](../../generalist/namespaces/Agent.md#startevent)

***

<a id="startoptions"></a>

### StartOptions

Re-exports [StartOptions](../../generalist/namespaces/Agent.md#startoptions)

***

<a id="steeringreceipt"></a>

### SteeringReceipt

Re-exports [SteeringReceipt](./Steering.md#steeringreceipt-1)

***

<a id="unknownresolution"></a>

### UnknownResolution

Re-exports [UnknownResolution](./Recovery.md#unknownresolution-1)
