[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Runtime

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

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

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

#### Properties

<a id="reason"></a>

##### reason?

> `readonly` `optional` **reason?**: `string`

<a id="runid-1"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="cancelsessioninput"></a>

### CancelSessionInput

#### Properties

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

> `readonly` **remainder**: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`

***

<a id="fanoutmemberinput"></a>

### FanOutMemberInput

#### Properties

<a id="inherit"></a>

##### inherit?

> `readonly` `optional` **inherit?**: [`InheritanceOptions`](../../generalist/namespaces/Agent#inheritanceoptions)

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

- [`SqliteStoreOptions`](../../runtime.sql-driver/index#sqlitestoreoptions)
- [`SqlStoreOptions`](../../runtime.sql-driver/index#sqlstoreoptions)

#### Properties

<a id="activationprojection"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: [`RunActivationProjection`](../../runtime.sql-driver/index#runactivationprojection)

Final-state callback executed synchronously inside each authoritative store transaction.

<a id="addresses"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](#addressbinding)[]

<a id="messagingpolicy"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](./Messaging/namespaces/MessagingPolicy#service)

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

> `readonly` `optional` **status?**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

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

> `readonly` **explain**: (`runId`) => `Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectError`](#inspecterror)\>

<a id="extendbudget"></a>

##### extendBudget

> `readonly` **extendBudget**: (`runId`, `delta`, `operator`) => `Effect`\<`void`, [`OperatorExtendBudgetError`](#operatorextendbudgeterror)\>

###### Parameters

###### runId

`string`

###### delta

[`Input`](../../generalist/namespaces/RunBudget#input)

###### operator

`string`

###### Returns

`Effect`\<`void`, [`OperatorExtendBudgetError`](#operatorextendbudgeterror)\>

<a id="resolveapproval"></a>

##### resolveApproval

> `readonly` **resolveApproval**: (`token`, `decision`, `operator`) => `Effect`\<`void`, [`OperatorApprovalError`](#operatorapprovalerror), [`RuleStore`](../../permissions#rulestore)\>

###### Parameters

###### token

`string`

###### decision

[`ResolveApprovalDecision`](./Recovery#resolveapprovaldecision)

###### operator

`string`

###### Returns

`Effect`\<`void`, [`OperatorApprovalError`](#operatorapprovalerror), [`RuleStore`](../../permissions#rulestore)\>

<a id="resolveunknown"></a>

##### resolveUnknown

> `readonly` **resolveUnknown**: (`runId`, `operationId`, `resolution`, `operator`) => `Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operationId

`string`

###### resolution

\{ `outcome`: `"succeeded"`; `result`: `unknown`; \} \| \{ `error`: `unknown`; `outcome`: `"failed"`; \}

###### operator

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

<a id="retry"></a>

##### retry

> `readonly` **retry**: (`runId`, `operator`) => `Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operator

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

> `readonly` **verify**: (`runId`) => `Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `drift`: readonly `string`[]; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `drift`: readonly `string`[]; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectError`](#inspecterror)\>

<a id="wake"></a>

##### wake

> `readonly` **wake**: (`runId`, `operator`) => `Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operator

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

> `readonly` **await**: `Effect`\<`Output`, [`RunFailed`](./RunEvent#runfailed) \| [`RunCancelled`](./RunEvent#runcancelled) \| [`EventsError`](#eventserror) \| [`InvalidOutput`](../../generalist/namespaces/AgentEvent#invalidoutput)\>

<a id="events"></a>

##### events

> `readonly` **events**: `Stream`\<[`StartEvent`](../../generalist/namespaces/Agent#startevent)\<`Output`\>, [`EventsError`](#eventserror) \| [`InvalidOutput`](../../generalist/namespaces/AgentEvent#invalidoutput)\>

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

> `readonly` `optional` **policy?**: `"enqueue"` \| `"interrupt"` \| `"reject"` \| `"rollback"` \| `"steer"`

***

<a id="runtimeinspection"></a>

### RuntimeInspection

Authoritative Runtime inspection, including the process-local Inspector snapshot shape.

#### Extends

- [`RunInspection`](./Run#runinspection)

#### Properties

<a id="activetools"></a>

##### activeTools

> `readonly` **activeTools**: readonly `string`[]

<a id="branches"></a>

##### branches

> `readonly` **branches**: readonly `object`[]

###### Inherited from

[`RunInspection`](./Run#runinspection).[`branches`](./Run#branches)

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

[`RunInspection`](./Run#runinspection).[`childReadiness`](./Run#childreadiness)

<a id="children"></a>

##### children

> `readonly` **children**: readonly [`ChildInspection`](./ChildAdmission#childinspection)[]

<a id="depth"></a>

##### depth

> `readonly` **depth**: `number`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`depth`](./Run#depth-1)

<a id="durability"></a>

##### durability

> `readonly` **durability**: `"ephemeral"` \| `"durable"`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`durability`](./Run#durability)

<a id="elapsed"></a>

##### elapsed

> `readonly` **elapsed**: `number`

<a id="executablemanifest"></a>

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

###### Inherited from

[`RunInspection`](./Run#runinspection).[`executableManifest`](./Run#executablemanifest-1)

<a id="executableref"></a>

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`RunInspection`](./Run#runinspection).[`executableRef`](./Run#executableref-1)

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

[`RunInspection`](./Run#runinspection).[`lastSequence`](./Run#lastsequence-1)

<a id="parentrunid-4"></a>

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`parentRunId`](./Run#parentrunid-1)

<a id="runid-9"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`runId`](./Run#runid-1)

<a id="status-1"></a>

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`status`](./Run#status-1)

<a id="suspension"></a>

##### suspension?

> `readonly` `optional` **suspension?**: [`ExecutionSuspension`](./ExecutionState#executionsuspension)

<a id="treepolicy"></a>

##### treePolicy

> `readonly` **treePolicy**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`treePolicy`](./Run#treepolicy-1)

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

> `readonly` **usageFacts**: readonly [`RawUsageFact`](./Run#rawusagefact)[]

<a id="waits"></a>

##### waits

> `readonly` **waits**: readonly `object`[]

###### Inherited from

[`RunInspection`](./Run#runinspection).[`waits`](./Run#waits-1)

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

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

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

> `readonly` `optional` **policy?**: `"enqueue"` \| `"interrupt"` \| `"reject"` \| `"rollback"` \| `"steer"`

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

- [`RuntimeHostSessions`](./HostSession#runtimehostsessions)

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

> `readonly` **activate**: (`input`) => `Effect`\<[`RunInspection`](./Run#runinspection), [`ActivateError`](#activateerror)\>

Idempotently activate an admitted root and return its authoritative current state.

###### Parameters

###### input

[`ActivateInput`](#activateinput)

###### Returns

`Effect`\<[`RunInspection`](./Run#runinspection), [`ActivateError`](#activateerror)\>

<a id="admit"></a>

##### admit

> `readonly` **admit**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`StartExecutionError`](#startexecutionerror)\>

Durably admit one exact root without making it executable.

###### Parameters

###### input

[`AdmitInput`](#admitinput)

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`StartExecutionError`](#startexecutionerror)\>

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

> `readonly` **awaitFanOut**: (`fanOutId`) => `Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, `AwaitFanOutError`\>

###### Parameters

###### fanOutId

`string`

###### Returns

`Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, `AwaitFanOutError`\>

<a id="awaitsessionterminal"></a>

##### awaitSessionTerminal

> `readonly` **awaitSessionTerminal**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

[`AwaitSessionTerminalInput`](#awaitsessionterminalinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

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

> `readonly` **cancelSession**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

[`CancelSessionInput`](#cancelsessioninput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

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

<a id="createsession"></a>

##### createSession

> `readonly` **createSession**: (`input`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`CreateSessionError`](./HostSession#createsessionerror)\>

###### Parameters

###### input

[`CreateSessionInput`](./HostSession#createsessioninput)

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`CreateSessionError`](./HostSession#createsessionerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession#runtimehostsessions).[`createSession`](./HostSession#createsession)

<a id="directory"></a>

##### directory

> `readonly` **directory**: (`runId`) => `Effect`\<readonly [`DirectoryEntry`](./AgentDirectory#directoryentry)[], [`DirectoryError`](#directoryerror)\>

Addresses this Run may reach under Generalist relationships plus host policy.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<readonly [`DirectoryEntry`](./AgentDirectory#directoryentry)[], [`DirectoryError`](#directoryerror)\>

<a id="events-1"></a>

##### events

> `readonly` **events**: (`input`) => `Stream`\<[`RunEvent`](./RunEvent#runevent), [`EventsError`](#eventserror)\>

###### Parameters

###### input

[`EventsInput`](#eventsinput)

###### Returns

`Stream`\<[`RunEvent`](./RunEvent#runevent), [`EventsError`](#eventserror)\>

<a id="extendbudget-1"></a>

##### extendBudget

> `readonly` **extendBudget**: (`runId`, `delta`) => `Effect`\<`void`, [`ExtendBudgetError`](#extendbudgeterror)\>

Primitive used by the operator API to journal a budget top-up and resume budget suspension.

###### Parameters

###### runId

`string`

###### delta

[`Input`](../../generalist/namespaces/RunBudget#input)

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

[`ForkOptions`](./Fork#forkoptions)

###### Returns

`Effect`\<[`RunHandle`](#runhandle)\<`unknown`\>, `ForkError`\>

<a id="history"></a>

##### history

> `readonly` **history**: (`input`) => `Effect`\<readonly [`RunEvent`](./RunEvent#runevent)[], [`EventsError`](#eventserror)\>

###### Parameters

###### input

[`HistoryInput`](#historyinput)

###### Returns

`Effect`\<readonly [`RunEvent`](./RunEvent#runevent)[], [`EventsError`](#eventserror)\>

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

> `readonly` **inspectFanOut**: (`fanOutId`) => `Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectFanOutError`](#inspectfanouterror)\>

###### Parameters

###### fanOutId

`string`

###### Returns

`Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectFanOutError`](#inspectfanouterror)\>

<a id="list"></a>

##### list

> `readonly` **list**: (`input`) => `Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

[`ListInput`](#listinput)

###### Returns

`Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="listsessions"></a>

##### listSessions

> `readonly` **listSessions**: `Effect`\<readonly `object`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession#runtimehostsessions).[`listSessions`](./HostSession#listsessions)

<a id="messages"></a>

##### messages

> `readonly` **messages**: (`input`) => `Effect`\<readonly [`MailboxEntry`](./Mailbox#mailboxentry)[], [`DirectoryError`](#directoryerror)\>

Pending addressed-message projections for this exact Run.

###### Parameters

###### input

[`MessagesInput`](#messagesinput)

###### Returns

`Effect`\<readonly [`MailboxEntry`](./Mailbox#mailboxentry)[], [`DirectoryError`](#directoryerror)\>

<a id="operator"></a>

##### operator

> `readonly` **operator**: [`OperatorService`](#operatorservice)

<a id="previews"></a>

##### previews

> `readonly` **previews**: (`input`) => `Stream`\<[`Event`](./ModelPreview#event)\>

Observe the memory-only live preview lane for one Run.
Frames contain bounded UTF-16 appends with per-attempt sequences and per-channel offsets.
Subscribers may lose frames without blocking execution and detect that loss from the next
frame. Preview events are memory-only and never durable RunEvents.

###### Parameters

###### input

[`PreviewsInput`](#previewsinput)

###### Returns

`Stream`\<[`Event`](./ModelPreview#event)\>

<a id="recordreward"></a>

##### recordReward

> `readonly` **recordReward**: (`input`) => `Effect`\<`void`, `RecordRewardError`\>

**`Internal`**

Journal one scalar reward assigned by an export policy.

###### Parameters

###### input

[`RewardInput`](./RunEvent#rewardinput)

###### Returns

`Effect`\<`void`, `RecordRewardError`\>

<a id="register"></a>

##### register

> `readonly` **register**: \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputCodec`, `OutputCodec`\>(`agent`) => `Effect`\<`void`, [`DuplicateAgent`](./Errors#duplicateagent), [`ClosedServices`](../../generalist/namespaces/Agent#closedservices)\<`Tools`, `R`, `InputCodec`, `OutputCodec`\>\>

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

[`Agent`](../../generalist/namespaces/Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputCodec`, `OutputCodec`\>

###### Returns

`Effect`\<`void`, [`DuplicateAgent`](./Errors#duplicateagent), [`ClosedServices`](../../generalist/namespaces/Agent#closedservices)\<`Tools`, `R`, `InputCodec`, `OutputCodec`\>\>

<a id="registeragentname"></a>

##### registerAgentName

> `readonly` **registerAgentName**: (`input`) => `Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), [`RegisterAgentNameError`](#registeragentnameerror)\>

Bind one host-assigned name, unique within the Run's naming scope.

###### Parameters

###### input

[`RegisterAgentNameInput`](#registeragentnameinput)

###### Returns

`Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), [`RegisterAgentNameError`](#registeragentnameerror)\>

<a id="resolvemodelresponse"></a>

##### resolveModelResponse

> `readonly` **resolveModelResponse**: (`event`) => `Effect`\<\{ `content`: readonly (\{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"reasoning"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `approvalId`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `toolCallId`: `string`; `type`: `"tool-approval-request"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `data`: `Uint8Array`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"file"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `fileName?`: `string`; `id`: `string`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"document"`; `title`: `string`; `type`: `"source"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"url"`; `title`: `string`; `type`: `"source"`; `url`: `URL`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id?`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `modelId?`: `string`; `request?`: \{ \}; `timestamp?`: `Utc`; `type`: `"response-metadata"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `reason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `response?`: \{ `headers`: \{\[`key`: `string`\]: `string` \| `Redacted`\<...\>; \}; `status`: `number`; \}; `type`: `"finish"`; `usage`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `params`: `unknown`; `providerExecuted`: `boolean`; `type`: `"tool-call"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `encodedResult`: `unknown`; `id`: `string`; `isFailure`: `boolean`; `memoized?`: \{ `fromOperation`: `string`; `fromRun`: `string`; \}; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `preliminary`: `boolean`; `providerExecuted`: `boolean`; `result`: `unknown`; `taint?`: readonly `object`[]; `type`: `"tool-result"`; \})[]; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `usage?`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \}, [`SessionEntryError`](#sessionentryerror)\>

###### Parameters

###### event

[`ModelResponseEvent`](#modelresponseevent)

###### Returns

`Effect`\<\{ `content`: readonly (\{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"reasoning"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `approvalId`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `toolCallId`: `string`; `type`: `"tool-approval-request"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `data`: `Uint8Array`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"file"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `fileName?`: `string`; `id`: `string`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"document"`; `title`: `string`; `type`: `"source"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"url"`; `title`: `string`; `type`: `"source"`; `url`: `URL`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id?`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `modelId?`: `string`; `request?`: \{ \}; `timestamp?`: `Utc`; `type`: `"response-metadata"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `reason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `response?`: \{ `headers`: \{\[`key`: `string`\]: `string` \| `Redacted`\<...\>; \}; `status`: `number`; \}; `type`: `"finish"`; `usage`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `params`: `unknown`; `providerExecuted`: `boolean`; `type`: `"tool-call"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `encodedResult`: `unknown`; `id`: `string`; `isFailure`: `boolean`; `memoized?`: \{ `fromOperation`: `string`; `fromRun`: `string`; \}; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `preliminary`: `boolean`; `providerExecuted`: `boolean`; `result`: `unknown`; `taint?`: readonly `object`[]; `type`: `"tool-result"`; \})[]; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `usage?`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \}, [`SessionEntryError`](#sessionentryerror)\>

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

[`RewindOptions`](./Fork#rewindoptions)

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

[`Agent`](../../generalist/namespaces/Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputCodec`, `OutputCodec`\>

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

> `readonly` **sendMessage**: (`input`) => `Effect`\<[`MessageReceipt`](./Mailbox#messagereceipt), [`SendMessageError`](#sendmessageerror)\>

Send one addressed message into the target's durable inbox.

Authorization is relationship-scoped from authoritative identity plus the host policy seam.
Address resolution selects one exact target Run before unified inbox admission.

###### Parameters

###### input

[`SendMessageInput`](#sendmessageinput)

###### Returns

`Effect`\<[`MessageReceipt`](./Mailbox#messagereceipt), [`SendMessageError`](#sendmessageerror)\>

<a id="session"></a>

##### session

> `readonly` **session**: (`sessionId`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionError`](./HostSession#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionError`](./HostSession#sessionerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession#runtimehostsessions).[`session`](./HostSession#session)

<a id="sessionentry"></a>

##### sessionEntry

> `readonly` **sessionEntry**: (`input`) => `Effect`\<[`Entry`](../../generalist/namespaces/Session#entry), [`SessionEntryError`](#sessionentryerror)\>

###### Parameters

###### input

[`SessionEntryInput`](#sessionentryinput)

###### Returns

`Effect`\<[`Entry`](../../generalist/namespaces/Session#entry), [`SessionEntryError`](#sessionentryerror)\>

<a id="sessionevents"></a>

##### sessionEvents

> `readonly` **sessionEvents**: (`input`) => `Stream`\<[`HostSessionEvent`](./HostSession#hostsessionevent), [`SessionEventsError`](./HostSession#sessioneventserror)\>

###### Parameters

###### input

[`SessionEventsInput`](./HostSession#sessioneventsinput)

###### Returns

`Stream`\<[`HostSessionEvent`](./HostSession#hostsessionevent), [`SessionEventsError`](./HostSession#sessioneventserror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession#runtimehostsessions).[`sessionEvents`](./HostSession#sessionevents)

<a id="sessionruns"></a>

##### sessionRuns

> `readonly` **sessionRuns**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`SessionError`](./HostSession#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`SessionError`](./HostSession#sessionerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession#runtimehostsessions).[`sessionRuns`](./HostSession#sessionruns)

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

> `readonly` **snapshot**: (`runId`) => `Effect`\<[`RunSnapshot`](./Run#runsnapshot), [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunSnapshot`](./Run#runsnapshot), [`InspectError`](#inspecterror)\>

<a id="spawn"></a>

##### spawn

> `readonly` **spawn**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`SpawnError`](#spawnerror)\>

###### Parameters

###### input

[`SpawnInput`](#spawninput)

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`SpawnError`](#spawnerror)\>

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

[`Agent`](../../generalist/namespaces/Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputCodec`, `OutputCodec`\>

###### input

`InputCodec`\[`"Type"`\]

###### options?

[`StartOptions`](../../generalist/namespaces/Agent#startoptions)

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

> `readonly` **treeCheckpoint**: (`rootRunId`) => `Effect`\<[`Checkpoint`](./RunTree#checkpoint), [`InspectError`](#inspecterror)\>

Atomically pair a point-in-time tree inspection with its exclusive replay cursor.

###### Parameters

###### rootRunId

`string`

###### Returns

`Effect`\<[`Checkpoint`](./RunTree#checkpoint), [`InspectError`](#inspecterror)\>

<a id="treereplay"></a>

##### treeReplay

> `readonly` **treeReplay**: (`input`) => `Effect`\<[`ReplayPage`](./RunTree#replaypage), [`TreeReplayError`](#treereplayerror)\>

Read one bounded, ordered page strictly after an opaque root-bound cursor.

###### Parameters

###### input

[`ReplayInput`](./RunTree#replayinput)

###### Returns

`Effect`\<[`ReplayPage`](./RunTree#replaypage), [`TreeReplayError`](#treereplayerror)\>

<a id="wake-1"></a>

##### wake

> `readonly` **wake**: (`runId`, `event`) => `Effect`\<\{ `waitId`: `string`; \} \| \{ \} \| \{ \}, [`WakeError`](#wakeerror)\>

Journal one validated environmental event and resume one matching wait at most once.

###### Parameters

###### runId

`string`

###### event

\{ `dedupeKey`: `string`; `payload`: `Json`; `scheduledAt`: `string`; `scheduleId`: `string`; \} \| \{ `dedupeKey`: `string`; `headers`: \{\[`key`: `string`\]: `string`; \}; `payload`: `Json`; `source`: `string`; \} \| \{ `childRunId`: `string`; `dedupeKey`: `string`; `terminalEventId`: `string`; \} \| \{ `dedupeKey`: `string`; `kind`: `"update"` \| `"create"` \| `"remove"`; `path`: `string`; \} \| \{ `approvalId`: `string`; `decision`: \{ \} \| \{ `reason?`: `string`; \}; `dedupeKey`: `string`; \}

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

#### Properties

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

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

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

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

***

<a id="startreceipt"></a>

### StartReceipt

#### Extends

- [`RunReceipt`](./Run#runreceipt)

#### Properties

<a id="acceptedsequence"></a>

##### acceptedSequence

> `readonly` **acceptedSequence**: `number`

###### Inherited from

[`RunReceipt`](./Run#runreceipt).[`acceptedSequence`](./Run#acceptedsequence)

<a id="childrunids"></a>

##### childRunIds

> `readonly` **childRunIds**: readonly `string`[]

<a id="duplicate"></a>

##### duplicate

> `readonly` **duplicate**: `boolean`

###### Inherited from

[`RunReceipt`](./Run#runreceipt).[`duplicate`](./Run#duplicate)

<a id="fanouts"></a>

##### fanOuts

> `readonly` **fanOuts**: readonly `object`[]

<a id="messageid-5"></a>

##### messageId

> `readonly` **messageId**: `string`

###### Inherited from

[`RunReceipt`](./Run#runreceipt).[`messageId`](./Run#messageid-1)

<a id="runid-13"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`RunReceipt`](./Run#runreceipt).[`runId`](./Run#runid-3)

## Type Aliases

<a id="ackerror"></a>

### AckError

> **AckError** = [`RunNotFound`](./Errors#runnotfound) \| [`AckInvalid`](./Errors#ackinvalid) \| [`AckBeyondCommitted`](./Errors#ackbeyondcommitted) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

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

> **ActivateError** = [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

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

> **CancelError** = [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="childsettlementerror"></a>

### ChildSettlementError

> **ChildSettlementError** = [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="directoryerror"></a>

### DirectoryError

> **DirectoryError** = [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="eventserror"></a>

### EventsError

> **EventsError** = [`RunNotFound`](./Errors#runnotfound) \| [`CursorExpired`](./Errors#cursorexpired) \| [`SubscriberLagged`](./Errors#subscriberlagged) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="extendbudgeterror"></a>

### ExtendBudgetError

> **ExtendBudgetError** = [`InspectError`](#inspecterror) \| [`Invalid`](../../generalist/namespaces/RunBudget#invalid)

***

<a id="fanouterror"></a>

### FanOutError

> **FanOutError** = [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./Errors#fanoutremainderunsupported) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted)

***

<a id="inspecterror"></a>

### InspectError

> **InspectError** = [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="inspectfanouterror"></a>

### InspectFanOutError

> **InspectFanOutError** = [`FanOutNotFound`](./Errors#fanoutnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="modelresponseevent"></a>

### ModelResponseEvent

> **ModelResponseEvent** = `Extract`\<[`RunEvent`](./RunEvent#runevent), \{ `_tag`: `"ModelResponseCommitted"` \| `"ModelResponseInterrupted"`; \}\>

***

<a id="operatoractionerror"></a>

### OperatorActionError

> **OperatorActionError** = [`InspectError`](#inspecterror) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)

***

<a id="operatorapprovalerror"></a>

### OperatorApprovalError

> **OperatorApprovalError** = [`ResolveError`](../../approvals#resolveerror) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)

***

<a id="operatorextendbudgeterror"></a>

### OperatorExtendBudgetError

> **OperatorExtendBudgetError** = [`ExtendBudgetError`](#extendbudgeterror) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)

***

<a id="registeragentnameerror"></a>

### RegisterAgentNameError

> **RegisterAgentNameError** = [`RunNotFound`](./Errors#runnotfound) \| [`AgentNameConflict`](./Errors#agentnameconflict) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="resolvemodelresponseerror"></a>

### ResolveModelResponseError

> **ResolveModelResponseError** = [`SessionEntryError`](#sessionentryerror)

***

<a id="respondapprovalerror"></a>

### RespondApprovalError

> **RespondApprovalError** = [`RunNotFound`](./Errors#runnotfound) \| [`ApprovalStale`](./Errors#approvalstale) \| [`ApprovalMismatch`](./Errors#approvalmismatch) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="responderror"></a>

### RespondError

> **RespondError** = [`RunNotFound`](./Errors#runnotfound) \| [`WaitNotOpen`](./Errors#waitnotopen) \| [`ResponseConflict`](./Errors#responseconflict) \| [`RunTerminal`](./Errors#runterminal) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="runsenderror"></a>

### RunSendError

> **RunSendError** = [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`RunBusy`](./Errors#runbusy) \| [`NotInFamily`](./Errors#notinfamily) \| [`SteeringConflict`](./Errors#steeringconflict) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`CursorExpired`](./Errors#cursorexpired) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="scheduleerror"></a>

### ScheduleError

> **ScheduleError** = [`UnknownAgent`](./Errors#unknownagent) \| [`AgentError`](../../generalist/namespaces/AgentEvent#agenterror) \| [`ScheduleInvalid`](#scheduleinvalid) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="schedulereceipt"></a>

### ScheduleReceipt

> **ScheduleReceipt** = *typeof* `ScheduleReceipt.Type`

Durable identity and first firing instant of a registered recurrence.

***

<a id="senderror"></a>

### SendError

> **SendError** = [`AddressNotFound`](./Errors#addressnotfound) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`ExecutableIdentityMismatch`](./Errors#executableidentitymismatch) \| [`ExecutablePinMissing`](./Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./Errors#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing) \| [`TreePolicyInvalid`](./Errors#treepolicyinvalid) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="sendmessageerror"></a>

### SendMessageError

> **SendMessageError** = [`AddressNotFound`](./Errors#addressnotfound) \| [`AddressInvalid`](./AgentDirectory#addressinvalid) \| [`NotInFamily`](./Errors#notinfamily) \| [`RunTerminal`](./Errors#runterminal) \| [`RunBusy`](./Errors#runbusy) \| [`RunNotFound`](./Errors#runnotfound) \| [`SteeringConflict`](./Errors#steeringconflict) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`CursorExpired`](./Errors#cursorexpired) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="sessionentryerror"></a>

### SessionEntryError

> **SessionEntryError** = [`SessionEntryNotFound`](./Errors#sessionentrynotfound) \| [`SessionEntryCorrupt`](./Errors#sessionentrycorrupt) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="signalerror"></a>

### SignalError

> **SignalError** = [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="spawnerror"></a>

### SpawnError

> **SpawnError** = [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted)

***

<a id="starterror"></a>

### StartError

> **StartError** = [`StartExecutionError`](#startexecutionerror) \| [`UnknownAgent`](./Errors#unknownagent) \| [`AgentError`](../../generalist/namespaces/AgentEvent#agenterror)

Typed Agent start failures before a Run handle exists.

***

<a id="startexecutionerror"></a>

### StartExecutionError

> **StartExecutionError** = [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`ExecutableIdentityMismatch`](./Errors#executableidentitymismatch) \| [`ExecutablePinMissing`](./Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./Errors#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`StartInvalid`](./Errors#startinvalid) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./Errors#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./Errors#treepolicyinvalid) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted)

***

<a id="treeeventserror"></a>

### TreeEventsError

> **TreeEventsError** = [`TreeReplayError`](#treereplayerror)

***

<a id="treereplayerror"></a>

### TreeReplayError

> **TreeReplayError** = [`RunNotFound`](./Errors#runnotfound) \| [`TreeCursorInvalid`](./Errors#treecursorinvalid) \| [`TreeCursorRootMismatch`](./Errors#treecursorrootmismatch) \| [`TreeCursorExpired`](./Errors#treecursorexpired) \| [`TreeCursorFuture`](./Errors#treecursorfuture) \| [`TreeReplayLimitInvalid`](./Errors#treereplaylimitinvalid) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="wakedisposition"></a>

### WakeDisposition

> **WakeDisposition** = *typeof* `WakeDisposition.Type`

Result of admitting one validated wake event to a Run.

***

<a id="wakeerror"></a>

### WakeError

> **WakeError** = [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`WakeEventInvalid`](#wakeeventinvalid)

## Variables

<a id="layermemory"></a>

### layerMemory

> `const` **layerMemory**: (`options`) => `Layer.Layer`\<[`Runtime`](#runtime) \| [`RunStore`](./RunStore#runstore) \| [`ExternalChildStore`](../../unstable.runtime.external-child-store#externalchildstore) \| [`RunExecutor`](./RunExecutor#runexecutor) \| [`LocalScheduler`](./LocalScheduler#localscheduler), `never`, [`ExecutableResolver`](./ExecutableResolver#executableresolver)\>

#### Parameters

##### options

[`LayerOptions`](#layeroptions)

#### Returns

`Layer.Layer`\<[`Runtime`](#runtime) \| [`RunStore`](./RunStore#runstore) \| [`ExternalChildStore`](../../unstable.runtime.external-child-store#externalchildstore) \| [`RunExecutor`](./RunExecutor#runexecutor) \| [`LocalScheduler`](./LocalScheduler#localscheduler), `never`, [`ExecutableResolver`](./ExecutableResolver#executableresolver)\>

***

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

Re-exports [CreateSessionError](./HostSession#createsessionerror)

***

<a id="createsessioninput"></a>

### CreateSessionInput

Re-exports [CreateSessionInput](./HostSession#createsessioninput)

***

<a id="hostsession"></a>

### HostSession

Re-exports [HostSession](../../host#hostsession)

***

<a id="hostsessionevent"></a>

### HostSessionEvent

Re-exports [HostSessionEvent](./HostSession#hostsessionevent)

***

<a id="modelpreviewchange"></a>

### ModelPreviewChange

Renames and re-exports [Change](./ModelPreview#change)

***

<a id="modelpreviewcleared"></a>

### ModelPreviewCleared

Renames and re-exports [Cleared](./ModelPreview#cleared)

***

<a id="modelpreviewevent"></a>

### ModelPreviewEvent

Renames and re-exports [Event](./ModelPreview#event)

***

<a id="modelpreviewframe"></a>

### ModelPreviewFrame

Renames and re-exports [Frame](./ModelPreview#frame)

***

<a id="recoverydecision"></a>

### RecoveryDecision

Re-exports [RecoveryDecision](./Recovery#recoverydecision-1)

***

<a id="recoveryexplanation"></a>

### RecoveryExplanation

Renames and re-exports [Explanation](./Recovery#explanation-1)

***

<a id="recoveryobligation"></a>

### RecoveryObligation

Renames and re-exports [Obligation](./Recovery#obligation-1)

***

<a id="recoveryverification"></a>

### RecoveryVerification

Renames and re-exports [Verification](./Recovery#verification-1)

***

<a id="respondapprovalinput"></a>

### RespondApprovalInput

Renames and re-exports [RespondInput](./Approval#respondinput-1)

***

<a id="sessionconflict"></a>

### SessionConflict

Re-exports [SessionConflict](../../host#sessionconflict)

***

<a id="sessioncursorexpired"></a>

### SessionCursorExpired

Re-exports [SessionCursorExpired](../../host#sessioncursorexpired)

***

<a id="sessionerror"></a>

### SessionError

Re-exports [SessionError](./HostSession#sessionerror)

***

<a id="sessioneventserror"></a>

### SessionEventsError

Re-exports [SessionEventsError](./HostSession#sessioneventserror)

***

<a id="sessioneventsinput"></a>

### SessionEventsInput

Re-exports [SessionEventsInput](./HostSession#sessioneventsinput)

***

<a id="sessionnotfound"></a>

### SessionNotFound

Re-exports [SessionNotFound](../../host#sessionnotfound)

***

<a id="sessionsubscriberlagged"></a>

### SessionSubscriberLagged

Re-exports [SessionSubscriberLagged](../../host#sessionsubscriberlagged)

***

<a id="startevent"></a>

### StartEvent

Re-exports [StartEvent](../../generalist/namespaces/Agent#startevent)

***

<a id="startoptions"></a>

### StartOptions

Re-exports [StartOptions](../../generalist/namespaces/Agent#startoptions)

***

<a id="steeringreceipt"></a>

### SteeringReceipt

Re-exports [SteeringReceipt](./Steering#steeringreceipt-1)

***

<a id="unknownresolution"></a>

### UnknownResolution

Re-exports [UnknownResolution](./Recovery#unknownresolution-1)
