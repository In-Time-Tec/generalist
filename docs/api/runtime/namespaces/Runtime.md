[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Runtime

# Runtime

## Classes

### Runtime

Hosted Runtime public contract and memory-backed layers.

#### Extends

- `Runtime_base`

#### Constructors

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

### ScheduleInvalid

A recurrence rule is outside Generalist's documented fixed UTC subset.

#### Extends

- `ScheduleInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ScheduleInvalid_base.hint`

##### rrule

> `readonly` **rrule**: `string`

###### Inherited from

`ScheduleInvalid_base.rrule`

***

### WakeEventInvalid

A Runtime wake value failed the public `WakeEvent` Schema.

#### Extends

- `WakeEventInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`WakeEventInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`WakeEventInvalid_base.message`

## Interfaces

### ActivateInput

Release one admitted root's durable execution gate.

#### Properties

##### runId

> `readonly` **runId**: `string`

***

### AddressBinding

#### Properties

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

##### executable

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

##### registrations

> `readonly` **registrations**: readonly `object`[]

***

### AwaitChildSettlementInput

#### Properties

##### childRunId

> `readonly` **childRunId**: `string`

##### parentRunId

> `readonly` **parentRunId**: `string`

***

### AwaitSessionTerminalInput

#### Properties

##### sessionId

> `readonly` **sessionId**: `string`

***

### CancelInput

#### Properties

##### reason?

> `readonly` `optional` **reason?**: `string`

##### runId

> `readonly` **runId**: `string`

***

### CancelSessionInput

#### Properties

##### reason?

> `readonly` `optional` **reason?**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

***

### ChildSettlementChangesInput

#### Properties

##### afterSequence?

> `readonly` `optional` **afterSequence?**: `number`

##### parentRunId

> `readonly` **parentRunId**: `string`

***

### ChildSettlementsInput

#### Properties

##### afterSequence?

> `readonly` `optional` **afterSequence?**: `number`

##### limit

> `readonly` **limit**: `number`

##### parentRunId

> `readonly` **parentRunId**: `string`

***

### EventsInput

#### Extended by

- [`HistoryInput`](#historyinput)

#### Properties

##### cursor?

> `readonly` `optional` **cursor?**: `number`

##### runId

> `readonly` **runId**: `string`

***

### FanOutInput

#### Properties

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

##### join

> `readonly` **join**: \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \} \| \{ \}

##### members

> `readonly` **members**: readonly [`FanOutMemberInput`](#fanoutmemberinput)[]

##### parentRunId

> `readonly` **parentRunId**: `string`

##### remainder

> `readonly` **remainder**: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`

***

### FanOutMemberInput

#### Properties

##### inherit?

> `readonly` `optional` **inherit?**: `Partial`\<\{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `history`: `"none"` \| `"summary"` \| `"full"`; `instructions`: `"inherit"` \| `"own"`; `memory`: `"fresh"` \| `"inherit"`; `permissions`: `"fresh"` \| `"inherit"`; `sandbox`: `"fresh"` \| `"fork"` \| `"share"`; `tasks`: `"none"` \| `"read"`; `tools`: `"attenuate"` \| `"same"`; \}\>

##### key

> `readonly` **key**: `string`

##### label?

> `readonly` `optional` **label?**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

##### origin?

> `readonly` `optional` **origin?**: `object`

###### operationKey?

> `readonly` `optional` **operationKey?**: `string`

###### parentToolCallId?

> `readonly` `optional` **parentToolCallId?**: `string`

##### prompt

> `readonly` **prompt**: `RawInput`

##### selection

> `readonly` **selection**: `string`

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

***

### HistoryInput

#### Extends

- [`EventsInput`](#eventsinput)

#### Properties

##### cursor?

> `readonly` `optional` **cursor?**: `number`

###### Inherited from

[`EventsInput`](#eventsinput).[`cursor`](#cursor)

##### limit

> `readonly` **limit**: `number`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`EventsInput`](#eventsinput).[`runId`](#runid-2)

***

### InitialChildInput

#### Properties

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

##### invocationId

> `readonly` **invocationId**: `string`

##### messageId?

> `readonly` `optional` **messageId?**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### prompt

> `readonly` **prompt**: `RawInput`

##### selection

> `readonly` **selection**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

***

### LayerOptions

#### Extended by

- [`SqliteStoreOptions`](../../runtime.sql-driver/index#sqlitestoreoptions)
- [`SqlStoreOptions`](../../runtime.sql-driver/index#sqlstoreoptions)

#### Properties

##### activationProjection?

> `readonly` `optional` **activationProjection?**: [`RunActivationProjection`](../../runtime.sql-driver/index#runactivationprojection)

Final-state callback executed synchronously inside each authoritative store transaction.

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](#addressbinding)[]

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](./Messaging/namespaces/MessagingPolicy#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

***

### ListInput

#### Properties

##### limit

> `readonly` **limit**: `number`

##### status?

> `readonly` `optional` **status?**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

***

### MessagesInput

#### Properties

##### limit

> `readonly` **limit**: `number`

##### runId

> `readonly` **runId**: `string`

***

### OperatorService

#### Properties

##### explain

> `readonly` **explain**: (`runId`) => `Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectError`](#inspecterror)\>

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

##### retry

> `readonly` **retry**: (`runId`, `operator`) => `Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operator

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](#operatoractionerror)\>

##### scanObligations

> `readonly` **scanObligations**: () => `Stream`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `runId`: `string`; \}, [`InspectError`](#inspecterror)\>

###### Returns

`Stream`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `runId`: `string`; \}, [`InspectError`](#inspecterror)\>

##### verify

> `readonly` **verify**: (`runId`) => `Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `drift`: readonly `string`[]; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `drift`: readonly `string`[]; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectError`](#inspecterror)\>

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

### PreviewsInput

Select the memory-only live preview lane for one Run.

#### Properties

##### runId

> `readonly` **runId**: `string`

***

### RegisterAgentNameInput

#### Properties

##### name

> `readonly` **name**: `string` & `Brand`\<`"generalist/runtime/AgentName"`\>

##### runId

> `readonly` **runId**: `string`

***

### RespondInput

#### Properties

##### resolution

> `readonly` **resolution**: \{ \} \| \{ `reason?`: `string`; \} \| \{ `encodedResult`: `unknown`; `result`: `unknown`; \}

##### runId

> `readonly` **runId**: `string`

##### waitId

> `readonly` **waitId**: `string`

***

### RunHandle

One typed durable Run and its replay-then-live event stream.

#### Type Parameters

##### Output

`Output`

#### Properties

##### await

> `readonly` **await**: `Effect`\<`Output`, [`RunFailed`](./RunEvent#runfailed) \| [`RunCancelled`](./RunEvent#runcancelled) \| [`EventsError`](#eventserror) \| [`InvalidOutput`](../../generalist/namespaces/AgentEvent#invalidoutput)\>

##### events

> `readonly` **events**: `Stream`\<[`StartEvent`](../../generalist/namespaces/Agent#startevent)\<`Output`\>, [`EventsError`](#eventserror) \| [`InvalidOutput`](../../generalist/namespaces/AgentEvent#invalidoutput)\>

##### runId

> `readonly` **runId**: `string`

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

### RunSendOptions

Admission options for a message sent to one existing Run.

#### Properties

##### from?

> `readonly` `optional` **from?**: \{ `runId`: `string`; \} \| \{ `user`: `string`; \} \| \{ `system`: `true`; \}

##### idempotencyKey?

> `readonly` `optional` **idempotencyKey?**: `string`

##### policy?

> `readonly` `optional` **policy?**: `"enqueue"` \| `"interrupt"` \| `"reject"` \| `"rollback"` \| `"steer"`

***

### RuntimeInspection

Authoritative Runtime inspection, including the process-local Inspector snapshot shape.

#### Extends

- [`RunInspection`](./Run#runinspection)

#### Properties

##### activeTools

> `readonly` **activeTools**: readonly `string`[]

##### branches

> `readonly` **branches**: readonly `object`[]

###### Inherited from

[`RunInspection`](./Run#runinspection).[`branches`](./Run#branches)

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

##### childReadiness?

> `readonly` `optional` **childReadiness?**: `"queued"` \| `"ready"` \| `"settled"`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`childReadiness`](./Run#childreadiness)

##### children

> `readonly` **children**: readonly [`ChildInspection`](./ChildAdmission#childinspection)[]

##### depth

> `readonly` **depth**: `number`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`depth`](./Run#depth-1)

##### durability

> `readonly` **durability**: `"ephemeral"` \| `"durable"`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`durability`](./Run#durability)

##### elapsed

> `readonly` **elapsed**: `number`

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

###### Inherited from

[`RunInspection`](./Run#runinspection).[`executableManifest`](./Run#executablemanifest-1)

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`RunInspection`](./Run#runinspection).[`executableRef`](./Run#executableref-1)

##### gates

> `readonly` **gates**: readonly `object`[]

##### lastEvent?

> `readonly` `optional` **lastEvent?**: `InspectionEvent`

##### lastSequence

> `readonly` **lastSequence**: `number`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`lastSequence`](./Run#lastsequence-1)

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`parentRunId`](./Run#parentrunid-1)

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`runId`](./Run#runid-1)

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`status`](./Run#status-1)

##### suspension?

> `readonly` `optional` **suspension?**: [`ExecutionSuspension`](./ExecutionState#executionsuspension)

##### treePolicy

> `readonly` **treePolicy**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

###### Inherited from

[`RunInspection`](./Run#runinspection).[`treePolicy`](./Run#treepolicy-1)

##### turn

> `readonly` **turn**: `number`

##### usage

> `readonly` **usage**: `object`

###### inputTokens

> `readonly` **inputTokens**: `number`

###### outputTokens

> `readonly` **outputTokens**: `number`

##### usageFacts

> `readonly` **usageFacts**: readonly [`RawUsageFact`](./Run#rawusagefact)[]

##### waits

> `readonly` **waits**: readonly `object`[]

###### Inherited from

[`RunInspection`](./Run#runinspection).[`waits`](./Run#waits-1)

***

### ScheduleOptions

Durable UTC fresh-Run recurrence.

#### Properties

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

##### rrule

> `readonly` **rrule**: `string`

##### scheduleId?

> `readonly` `optional` **scheduleId?**: `string`

Stable identity for idempotent registration across Runtime restarts.

##### sessionId

> `readonly` **sessionId**: `string`

***

### SendInput

#### Properties

##### causationId?

> `readonly` `optional` **causationId?**: `string`

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

##### from?

> `readonly` `optional` **from?**: `string` & `Brand`\<`"Address"`\>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

##### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

##### messageId?

> `readonly` `optional` **messageId?**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### prompt

> `readonly` **prompt**: `RawInput`

##### runId?

> `readonly` `optional` **runId?**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

##### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

##### treePolicy?

> `readonly` `optional` **treePolicy?**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

***

### SendMessageInput

One addressed send between agents.

`fromRunId` is the authoritative sender: Generalist reads its identity, parentage, and session from the
durable Run record, so callers cannot forge a sender by supplying an Address.

#### Properties

##### causationId?

> `readonly` `optional` **causationId?**: `string`

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

##### fromRunId

> `readonly` **fromRunId**: `string`

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

##### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

##### messageId?

> `readonly` `optional` **messageId?**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### policy?

> `readonly` `optional` **policy?**: `"enqueue"` \| `"interrupt"` \| `"reject"` \| `"rollback"` \| `"steer"`

##### prompt

> `readonly` **prompt**: `RawInput`

##### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

***

### Service

Runtime operations that persist and observe product-facing Sessions.

#### Extends

- [`RuntimeHostSessions`](./HostSession#runtimehostsessions)

#### Properties

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

##### acknowledged

> `readonly` **acknowledged**: (`runId`) => `Effect`\<\{ `acknowledgedAt?`: `string`; `runId`: `string`; `sequence`: `number`; \}, [`InspectError`](#inspecterror)\>

Read the durable host processed-through point; -1 means no cycle is acknowledged.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `acknowledgedAt?`: `string`; `runId`: `string`; `sequence`: `number`; \}, [`InspectError`](#inspecterror)\>

##### activate

> `readonly` **activate**: (`input`) => `Effect`\<[`RunInspection`](./Run#runinspection), [`ActivateError`](#activateerror)\>

Idempotently activate an admitted root and return its authoritative current state.

###### Parameters

###### input

[`ActivateInput`](#activateinput)

###### Returns

`Effect`\<[`RunInspection`](./Run#runinspection), [`ActivateError`](#activateerror)\>

##### admit

> `readonly` **admit**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`StartExecutionError`](#startexecutionerror)\>

Durably admit one exact root without making it executable.

###### Parameters

###### input

[`AdmitInput`](#admitinput)

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`StartExecutionError`](#startexecutionerror)\>

##### awaitChildSettlement

> `readonly` **awaitChildSettlement**: (`input`) => `Effect`\<\{ `_tag`: `"ChildSettlement"`; `admittedAtMillis`: `number`; `childRunId`: `string`; `joined?`: `boolean`; `notificationId`: `string`; `parentRunId`: `string`; `resultBytes`: `number`; `resultText`: `string`; `resultTruncated`: `boolean`; `sequence`: `number`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"`; `terminalEventId`: `string`; \}, [`ChildSettlementError`](#childsettlementerror)\>

Wait for one child's durable settlement without executing or scheduling the parent.

###### Parameters

###### input

[`AwaitChildSettlementInput`](#awaitchildsettlementinput)

###### Returns

`Effect`\<\{ `_tag`: `"ChildSettlement"`; `admittedAtMillis`: `number`; `childRunId`: `string`; `joined?`: `boolean`; `notificationId`: `string`; `parentRunId`: `string`; `resultBytes`: `number`; `resultText`: `string`; `resultTruncated`: `boolean`; `sequence`: `number`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"`; `terminalEventId`: `string`; \}, [`ChildSettlementError`](#childsettlementerror)\>

##### awaitFanOut

> `readonly` **awaitFanOut**: (`fanOutId`) => `Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, `AwaitFanOutError`\>

###### Parameters

###### fanOutId

`string`

###### Returns

`Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, `AwaitFanOutError`\>

##### awaitSessionTerminal

> `readonly` **awaitSessionTerminal**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

[`AwaitSessionTerminalInput`](#awaitsessionterminalinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

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

##### cancelSession

> `readonly` **cancelSession**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

[`CancelSessionInput`](#cancelsessioninput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

##### childSettlementChanges

> `readonly` **childSettlementChanges**: (`input`) => `Stream`\<\{ `_tag`: `"ChildSettlement"`; `admittedAtMillis`: `number`; `childRunId`: `string`; `joined?`: `boolean`; `notificationId`: `string`; `parentRunId`: `string`; `resultBytes`: `number`; `resultText`: `string`; `resultTruncated`: `boolean`; `sequence`: `number`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"`; `terminalEventId`: `string`; \}, [`ChildSettlementError`](#childsettlementerror)\>

Subscribe to durable child settlements, replaying entries after the requested sequence.

###### Parameters

###### input

[`ChildSettlementChangesInput`](#childsettlementchangesinput)

###### Returns

`Stream`\<\{ `_tag`: `"ChildSettlement"`; `admittedAtMillis`: `number`; `childRunId`: `string`; `joined?`: `boolean`; `notificationId`: `string`; `parentRunId`: `string`; `resultBytes`: `number`; `resultText`: `string`; `resultTruncated`: `boolean`; `sequence`: `number`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"`; `terminalEventId`: `string`; \}, [`ChildSettlementError`](#childsettlementerror)\>

##### childSettlements

> `readonly` **childSettlements**: (`input`) => `Effect`\<readonly `object`[], [`ChildSettlementError`](#childsettlementerror)\>

Read ordered durable child settlements for one exact parent Run.

###### Parameters

###### input

[`ChildSettlementsInput`](#childsettlementsinput)

###### Returns

`Effect`\<readonly `object`[], [`ChildSettlementError`](#childsettlementerror)\>

##### createSession

> `readonly` **createSession**: (`input`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`CreateSessionError`](./HostSession#createsessionerror)\>

###### Parameters

###### input

[`CreateSessionInput`](./HostSession#createsessioninput)

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`CreateSessionError`](./HostSession#createsessionerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession#runtimehostsessions).[`createSession`](./HostSession#createsession)

##### directory

> `readonly` **directory**: (`runId`) => `Effect`\<readonly [`DirectoryEntry`](./AgentDirectory#directoryentry)[], [`DirectoryError`](#directoryerror)\>

Addresses this Run may reach under Generalist relationships plus host policy.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<readonly [`DirectoryEntry`](./AgentDirectory#directoryentry)[], [`DirectoryError`](#directoryerror)\>

##### events

> `readonly` **events**: (`input`) => `Stream`\<[`RunEvent`](./RunEvent#runevent), [`EventsError`](#eventserror)\>

###### Parameters

###### input

[`EventsInput`](#eventsinput)

###### Returns

`Stream`\<[`RunEvent`](./RunEvent#runevent), [`EventsError`](#eventserror)\>

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

##### fanOut

> `readonly` **fanOut**: (`input`) => `Effect`\<\{ `childRunIds`: readonly `string`[]; `duplicate`: `boolean`; `fanOutId`: `string`; `parentRunId`: `string`; \}, [`FanOutError`](#fanouterror)\>

###### Parameters

###### input

[`FanOutInput`](#fanoutinput)

###### Returns

`Effect`\<\{ `childRunIds`: readonly `string`[]; `duplicate`: `boolean`; `fanOutId`: `string`; `parentRunId`: `string`; \}, [`FanOutError`](#fanouterror)\>

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

##### history

> `readonly` **history**: (`input`) => `Effect`\<readonly [`RunEvent`](./RunEvent#runevent)[], [`EventsError`](#eventserror)\>

###### Parameters

###### input

[`HistoryInput`](#historyinput)

###### Returns

`Effect`\<readonly [`RunEvent`](./RunEvent#runevent)[], [`EventsError`](#eventserror)\>

##### inspect

> `readonly` **inspect**: (`runId`) => `Effect`\<[`RuntimeInspection`](#runtimeinspection), [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RuntimeInspection`](#runtimeinspection), [`InspectError`](#inspecterror)\>

##### inspectFanOut

> `readonly` **inspectFanOut**: (`fanOutId`) => `Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectFanOutError`](#inspectfanouterror)\>

###### Parameters

###### fanOutId

`string`

###### Returns

`Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectFanOutError`](#inspectfanouterror)\>

##### list

> `readonly` **list**: (`input`) => `Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

[`ListInput`](#listinput)

###### Returns

`Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

##### listSessions

> `readonly` **listSessions**: `Effect`\<readonly `object`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession#runtimehostsessions).[`listSessions`](./HostSession#listsessions)

##### messages

> `readonly` **messages**: (`input`) => `Effect`\<readonly [`MailboxEntry`](./Mailbox#mailboxentry)[], [`DirectoryError`](#directoryerror)\>

Pending addressed-message projections for this exact Run.

###### Parameters

###### input

[`MessagesInput`](#messagesinput)

###### Returns

`Effect`\<readonly [`MailboxEntry`](./Mailbox#mailboxentry)[], [`DirectoryError`](#directoryerror)\>

##### operator

> `readonly` **operator**: [`OperatorService`](#operatorservice)

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

##### recordReward

> `readonly` **recordReward**: (`input`) => `Effect`\<`void`, `RecordRewardError`\>

**`Internal`**

Journal one scalar reward assigned by an export policy.

###### Parameters

###### input

[`RewardInput`](./RunEvent#rewardinput)

###### Returns

`Effect`\<`void`, `RecordRewardError`\>

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

##### registerAgentName

> `readonly` **registerAgentName**: (`input`) => `Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), [`RegisterAgentNameError`](#registeragentnameerror)\>

Bind one host-assigned name, unique within the Run's naming scope.

###### Parameters

###### input

[`RegisterAgentNameInput`](#registeragentnameinput)

###### Returns

`Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), [`RegisterAgentNameError`](#registeragentnameerror)\>

##### resolveModelResponse

> `readonly` **resolveModelResponse**: (`event`) => `Effect`\<\{ `content`: readonly (\{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"reasoning"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `approvalId`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `toolCallId`: `string`; `type`: `"tool-approval-request"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `data`: `Uint8Array`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"file"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `fileName?`: `string`; `id`: `string`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"document"`; `title`: `string`; `type`: `"source"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"url"`; `title`: `string`; `type`: `"source"`; `url`: `URL`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id?`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `modelId?`: `string`; `request?`: \{ \}; `timestamp?`: `Utc`; `type`: `"response-metadata"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `reason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `response?`: \{ `headers`: \{\[`key`: `string`\]: `string` \| `Redacted`\<...\>; \}; `status`: `number`; \}; `type`: `"finish"`; `usage`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `params`: `unknown`; `providerExecuted`: `boolean`; `type`: `"tool-call"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `encodedResult`: `unknown`; `id`: `string`; `isFailure`: `boolean`; `memoized?`: \{ `fromOperation`: `string`; `fromRun`: `string`; \}; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `preliminary`: `boolean`; `providerExecuted`: `boolean`; `result`: `unknown`; `type`: `"tool-result"`; \})[]; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `usage?`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \}, [`SessionEntryError`](#sessionentryerror)\>

###### Parameters

###### event

[`ModelResponseEvent`](#modelresponseevent)

###### Returns

`Effect`\<\{ `content`: readonly (\{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"reasoning"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `approvalId`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `toolCallId`: `string`; `type`: `"tool-approval-request"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `data`: `Uint8Array`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"file"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `fileName?`: `string`; `id`: `string`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"document"`; `title`: `string`; `type`: `"source"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"url"`; `title`: `string`; `type`: `"source"`; `url`: `URL`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id?`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `modelId?`: `string`; `request?`: \{ \}; `timestamp?`: `Utc`; `type`: `"response-metadata"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `reason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `response?`: \{ `headers`: \{\[`key`: `string`\]: `string` \| `Redacted`\<...\>; \}; `status`: `number`; \}; `type`: `"finish"`; `usage`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `params`: `unknown`; `providerExecuted`: `boolean`; `type`: `"tool-call"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `encodedResult`: `unknown`; `id`: `string`; `isFailure`: `boolean`; `memoized?`: \{ `fromOperation`: `string`; `fromRun`: `string`; \}; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `preliminary`: `boolean`; `providerExecuted`: `boolean`; `result`: `unknown`; `type`: `"tool-result"`; \})[]; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `usage?`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \}, [`SessionEntryError`](#sessionentryerror)\>

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

##### respond

> `readonly` **respond**: (`input`) => `Effect`\<`void`, [`RespondError`](#responderror)\>

###### Parameters

###### input

[`RespondInput`](#respondinput)

###### Returns

`Effect`\<`void`, [`RespondError`](#responderror)\>

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

##### send

> `readonly` **send**: `SendFunction`

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

##### session

> `readonly` **session**: (`sessionId`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionError`](./HostSession#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionError`](./HostSession#sessionerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession#runtimehostsessions).[`session`](./HostSession#session)

##### sessionEntry

> `readonly` **sessionEntry**: (`input`) => `Effect`\<[`Entry`](../../generalist/namespaces/Session#entry), [`SessionEntryError`](#sessionentryerror)\>

###### Parameters

###### input

[`SessionEntryInput`](#sessionentryinput)

###### Returns

`Effect`\<[`Entry`](../../generalist/namespaces/Session#entry), [`SessionEntryError`](#sessionentryerror)\>

##### sessionEvents

> `readonly` **sessionEvents**: (`input`) => `Stream`\<[`HostSessionEvent`](./HostSession#hostsessionevent), [`SessionEventsError`](./HostSession#sessioneventserror)\>

###### Parameters

###### input

[`SessionEventsInput`](./HostSession#sessioneventsinput)

###### Returns

`Stream`\<[`HostSessionEvent`](./HostSession#hostsessionevent), [`SessionEventsError`](./HostSession#sessioneventserror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession#runtimehostsessions).[`sessionEvents`](./HostSession#sessionevents)

##### sessionRuns

> `readonly` **sessionRuns**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`SessionError`](./HostSession#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`SessionError`](./HostSession#sessionerror)\>

###### Inherited from

[`RuntimeHostSessions`](./HostSession#runtimehostsessions).[`sessionRuns`](./HostSession#sessionruns)

##### signal

> `readonly` **signal**: (`input`) => `Effect`\<`void`, [`SignalError`](#signalerror)\>

###### Parameters

###### input

[`SignalInput`](#signalinput)

###### Returns

`Effect`\<`void`, [`SignalError`](#signalerror)\>

##### snapshot

> `readonly` **snapshot**: (`runId`) => `Effect`\<[`RunSnapshot`](./Run#runsnapshot), [`InspectError`](#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunSnapshot`](./Run#runsnapshot), [`InspectError`](#inspecterror)\>

##### spawn

> `readonly` **spawn**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`SpawnError`](#spawnerror)\>

###### Parameters

###### input

[`SpawnInput`](#spawninput)

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`SpawnError`](#spawnerror)\>

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

##### startExecution

> `readonly` **startExecution**: (`input`) => `Effect`\<[`StartReceipt`](#startreceipt), [`StartExecutionError`](#startexecutionerror)\>

**`Internal`**

Begin one already-normalized pinned execution.

###### Parameters

###### input

[`StartExecutionInput`](#startexecutioninput)

###### Returns

`Effect`\<[`StartReceipt`](#startreceipt), [`StartExecutionError`](#startexecutionerror)\>

##### treeChanges

> `readonly` **treeChanges**: (`rootRunId`) => `Stream`\<`void`, [`TreeReplayError`](#treereplayerror)\>

###### Parameters

###### rootRunId

`string`

###### Returns

`Stream`\<`void`, [`TreeReplayError`](#treereplayerror)\>

##### treeCheckpoint

> `readonly` **treeCheckpoint**: (`rootRunId`) => `Effect`\<[`Checkpoint`](./RunTree#checkpoint), [`InspectError`](#inspecterror)\>

Atomically pair a point-in-time tree inspection with its exclusive replay cursor.

###### Parameters

###### rootRunId

`string`

###### Returns

`Effect`\<[`Checkpoint`](./RunTree#checkpoint), [`InspectError`](#inspecterror)\>

##### treeReplay

> `readonly` **treeReplay**: (`input`) => `Effect`\<[`ReplayPage`](./RunTree#replaypage), [`TreeReplayError`](#treereplayerror)\>

Read one bounded, ordered page strictly after an opaque root-bound cursor.

###### Parameters

###### input

[`ReplayInput`](./RunTree#replayinput)

###### Returns

`Effect`\<[`ReplayPage`](./RunTree#replaypage), [`TreeReplayError`](#treereplayerror)\>

##### wake

> `readonly` **wake**: (`runId`, `event`) => `Effect`\<\{ `waitId`: `string`; \} \| \{ \} \| \{ \}, [`WakeError`](#wakeerror)\>

Journal one validated environmental event and resume one matching wait at most once.

###### Parameters

###### runId

`string`

###### event

\{ `dedupeKey`: `string`; `payload`: `Json`; `scheduledAt`: `string`; `scheduleId`: `string`; \} \| \{ `dedupeKey`: `string`; `headers`: \{\[`key`: `string`\]: `string`; \}; `payload`: `Json`; `source`: `string`; \} \| \{ `childRunId`: `string`; `dedupeKey`: `string`; `terminalEventId`: `string`; \} \| \{ `dedupeKey`: `string`; `kind`: `"create"` \| `"remove"` \| `"update"`; `path`: `string`; \} \| \{ `approvalId`: `string`; `decision`: \{ \} \| \{ `reason?`: `string`; \}; `dedupeKey`: `string`; \}

###### Returns

`Effect`\<\{ `waitId`: `string`; \} \| \{ \} \| \{ \}, [`WakeError`](#wakeerror)\>

***

### SessionEntryInput

#### Properties

##### entryId

> `readonly` **entryId**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

***

### SignalInput

#### Properties

##### name

> `readonly` **name**: `string`

##### payload?

> `readonly` `optional` **payload?**: `unknown`

##### runId

> `readonly` **runId**: `string`

***

### SpawnInput

#### Properties

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

##### idempotencyKey?

> `readonly` `optional` **idempotencyKey?**: `string`

##### invocationId

> `readonly` **invocationId**: `string`

##### label?

> `readonly` `optional` **label?**: `string`

##### messageId?

> `readonly` `optional` **messageId?**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### origin?

> `readonly` `optional` **origin?**: `object`

###### operationKey?

> `readonly` `optional` **operationKey?**: `string`

###### parentToolCallId?

> `readonly` `optional` **parentToolCallId?**: `string`

##### parentRunId

> `readonly` **parentRunId**: `string`

##### prompt

> `readonly` **prompt**: `RawInput`

##### selection

> `readonly` **selection**: `string`

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

***

### StartExecutionInput

**`Internal`**

Exact root execution admission used below the typed Agent API.

#### Properties

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

##### causationId?

> `readonly` `optional` **causationId?**: `string`

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

##### executable

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

##### initialChildren?

> `readonly` `optional` **initialChildren?**: readonly [`InitialChildInput`](#initialchildinput)[]

##### initialFanOuts?

> `readonly` `optional` **initialFanOuts?**: readonly `InitialFanOutInput`[]

##### messageId?

> `readonly` `optional` **messageId?**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### prompt

> `readonly` **prompt**: `RawInput`

##### registrations

> `readonly` **registrations**: readonly `object`[]

##### runId?

> `readonly` `optional` **runId?**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

##### treePolicy?

> `readonly` `optional` **treePolicy?**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

***

### StartReceipt

#### Extends

- [`RunReceipt`](./Run#runreceipt)

#### Properties

##### acceptedSequence

> `readonly` **acceptedSequence**: `number`

###### Inherited from

[`RunReceipt`](./Run#runreceipt).[`acceptedSequence`](./Run#acceptedsequence)

##### childRunIds

> `readonly` **childRunIds**: readonly `string`[]

##### duplicate

> `readonly` **duplicate**: `boolean`

###### Inherited from

[`RunReceipt`](./Run#runreceipt).[`duplicate`](./Run#duplicate)

##### fanOuts

> `readonly` **fanOuts**: readonly `object`[]

##### messageId

> `readonly` **messageId**: `string`

###### Inherited from

[`RunReceipt`](./Run#runreceipt).[`messageId`](./Run#messageid-1)

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`RunReceipt`](./Run#runreceipt).[`runId`](./Run#runid-3)

## Type Aliases

### AckError

> **AckError** = [`RunNotFound`](./Errors#runnotfound) \| [`AckInvalid`](./Errors#ackinvalid) \| [`AckBeyondCommitted`](./Errors#ackbeyondcommitted) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

Durable host acknowledgement failures.

***

### AckPoint

> **AckPoint** = `Struct`\<\{ `acknowledgedAt`: `optionalKey`\<`String`\>; `runId`: `String`; `sequence`: `Int`; \}\>

One durable host processed-through point on the Run event sequence.

***

### AckPoint

> **AckPoint** = *typeof* `Point.Type`

One durable host processed-through point on the Run event sequence.

***

### ActivateError

> **ActivateError** = [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

Staged root activation failures.

***

### AdmitError

> **AdmitError** = [`StartExecutionError`](#startexecutionerror)

Exact-root staged admission failures.

***

### AdmitInput

> **AdmitInput** = `Omit`\<[`StartExecutionInput`](#startexecutioninput), `"initialChildren"` \| `"initialFanOuts"`\>

One exact root admission held behind Generalist's durable execution gate.

***

### CancelError

> **CancelError** = [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### ChildSettlementError

> **ChildSettlementError** = [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### DirectoryError

> **DirectoryError** = [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### EventsError

> **EventsError** = [`RunNotFound`](./Errors#runnotfound) \| [`CursorExpired`](./Errors#cursorexpired) \| [`SubscriberLagged`](./Errors#subscriberlagged) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### ExtendBudgetError

> **ExtendBudgetError** = [`InspectError`](#inspecterror) \| [`Invalid`](../../generalist/namespaces/RunBudget#invalid)

***

### FanOutError

> **FanOutError** = [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./Errors#fanoutremainderunsupported) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted)

***

### InspectError

> **InspectError** = [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### InspectFanOutError

> **InspectFanOutError** = [`FanOutNotFound`](./Errors#fanoutnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### ModelResponseEvent

> **ModelResponseEvent** = `Extract`\<[`RunEvent`](./RunEvent#runevent), \{ `_tag`: `"ModelResponseCommitted"` \| `"ModelResponseInterrupted"`; \}\>

***

### OperatorActionError

> **OperatorActionError** = [`InspectError`](#inspecterror) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)

***

### OperatorApprovalError

> **OperatorApprovalError** = [`ResolveError`](../../approvals#resolveerror) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)

***

### OperatorExtendBudgetError

> **OperatorExtendBudgetError** = [`ExtendBudgetError`](#extendbudgeterror) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)

***

### RegisterAgentNameError

> **RegisterAgentNameError** = [`RunNotFound`](./Errors#runnotfound) \| [`AgentNameConflict`](./Errors#agentnameconflict) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### ResolveModelResponseError

> **ResolveModelResponseError** = [`SessionEntryError`](#sessionentryerror)

***

### RespondApprovalError

> **RespondApprovalError** = [`RunNotFound`](./Errors#runnotfound) \| [`ApprovalStale`](./Errors#approvalstale) \| [`ApprovalMismatch`](./Errors#approvalmismatch) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### RespondError

> **RespondError** = [`RunNotFound`](./Errors#runnotfound) \| [`WaitNotOpen`](./Errors#waitnotopen) \| [`ResponseConflict`](./Errors#responseconflict) \| [`RunTerminal`](./Errors#runterminal) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### RunSendError

> **RunSendError** = [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`RunBusy`](./Errors#runbusy) \| [`NotInFamily`](./Errors#notinfamily) \| [`SteeringConflict`](./Errors#steeringconflict) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`CursorExpired`](./Errors#cursorexpired) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### ScheduleError

> **ScheduleError** = [`UnknownAgent`](./Errors#unknownagent) \| [`AgentError`](../../generalist/namespaces/AgentEvent#agenterror) \| [`ScheduleInvalid`](#scheduleinvalid) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### ScheduleReceipt

> **ScheduleReceipt** = *typeof* `ScheduleReceipt.Type`

Durable identity and first firing instant of a registered recurrence.

***

### SendError

> **SendError** = [`AddressNotFound`](./Errors#addressnotfound) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`ExecutableIdentityMismatch`](./Errors#executableidentitymismatch) \| [`ExecutablePinMissing`](./Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./Errors#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing) \| [`TreePolicyInvalid`](./Errors#treepolicyinvalid) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### SendMessageError

> **SendMessageError** = [`AddressNotFound`](./Errors#addressnotfound) \| [`AddressInvalid`](./AgentDirectory#addressinvalid) \| [`NotInFamily`](./Errors#notinfamily) \| [`RunTerminal`](./Errors#runterminal) \| [`RunBusy`](./Errors#runbusy) \| [`RunNotFound`](./Errors#runnotfound) \| [`SteeringConflict`](./Errors#steeringconflict) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`CursorExpired`](./Errors#cursorexpired) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### SessionEntryError

> **SessionEntryError** = [`SessionEntryNotFound`](./Errors#sessionentrynotfound) \| [`SessionEntryCorrupt`](./Errors#sessionentrycorrupt) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### SignalError

> **SignalError** = [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### SpawnError

> **SpawnError** = [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted)

***

### StartError

> **StartError** = [`StartExecutionError`](#startexecutionerror) \| [`UnknownAgent`](./Errors#unknownagent) \| [`AgentError`](../../generalist/namespaces/AgentEvent#agenterror)

Typed Agent start failures before a Run handle exists.

***

### StartExecutionError

> **StartExecutionError** = [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`ExecutableIdentityMismatch`](./Errors#executableidentitymismatch) \| [`ExecutablePinMissing`](./Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./Errors#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`StartInvalid`](./Errors#startinvalid) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./Errors#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./Errors#treepolicyinvalid) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted)

***

### TreeEventsError

> **TreeEventsError** = [`TreeReplayError`](#treereplayerror)

***

### TreeReplayError

> **TreeReplayError** = [`RunNotFound`](./Errors#runnotfound) \| [`TreeCursorInvalid`](./Errors#treecursorinvalid) \| [`TreeCursorRootMismatch`](./Errors#treecursorrootmismatch) \| [`TreeCursorExpired`](./Errors#treecursorexpired) \| [`TreeCursorFuture`](./Errors#treecursorfuture) \| [`TreeReplayLimitInvalid`](./Errors#treereplaylimitinvalid) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### WakeDisposition

> **WakeDisposition** = *typeof* `WakeDisposition.Type`

Result of admitting one validated wake event to a Run.

***

### WakeError

> **WakeError** = [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`WakeEventInvalid`](#wakeeventinvalid)

## Variables

### layerMemory

> `const` **layerMemory**: (`options`) => `Layer.Layer`\<[`Runtime`](#runtime) \| [`RunStore`](./RunStore#runstore) \| [`ExternalChildStore`](../../unstable.runtime.external-child-store#externalchildstore) \| [`RunExecutor`](./RunExecutor#runexecutor) \| [`LocalScheduler`](./LocalScheduler#localscheduler), `never`, [`ExecutableResolver`](./ExecutableResolver#executableresolver)\>

#### Parameters

##### options

[`LayerOptions`](#layeroptions)

#### Returns

`Layer.Layer`\<[`Runtime`](#runtime) \| [`RunStore`](./RunStore#runstore) \| [`ExternalChildStore`](../../unstable.runtime.external-child-store#externalchildstore) \| [`RunExecutor`](./RunExecutor#runexecutor) \| [`LocalScheduler`](./LocalScheduler#localscheduler), `never`, [`ExecutableResolver`](./ExecutableResolver#executableresolver)\>

***

### ScheduleReceipt

> `const` **ScheduleReceipt**: `Schema.Struct`\<\{ `nextAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>

Durable identity and first firing instant of a registered recurrence.

***

### WakeDisposition

> `const` **WakeDisposition**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resumed"`, \{ `waitId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Duplicate"`, \{ \}\>, `Schema.TaggedStruct`\<`"Ignored"`, \{ \}\>\]\>

Result of admitting one validated wake event to a Run.

## References

### CreateSessionError

Re-exports [CreateSessionError](./HostSession#createsessionerror)

***

### CreateSessionInput

Re-exports [CreateSessionInput](./HostSession#createsessioninput)

***

### HostSession

Re-exports [HostSession](../../host#hostsession)

***

### HostSessionEvent

Re-exports [HostSessionEvent](./HostSession#hostsessionevent)

***

### ModelPreviewChange

Renames and re-exports [Change](./ModelPreview#change)

***

### ModelPreviewCleared

Renames and re-exports [Cleared](./ModelPreview#cleared)

***

### ModelPreviewEvent

Renames and re-exports [Event](./ModelPreview#event)

***

### ModelPreviewFrame

Renames and re-exports [Frame](./ModelPreview#frame)

***

### RecoveryDecision

Re-exports [RecoveryDecision](./Recovery#recoverydecision-1)

***

### RecoveryExplanation

Renames and re-exports [Explanation](./Recovery#explanation-1)

***

### RecoveryObligation

Renames and re-exports [Obligation](./Recovery#obligation-1)

***

### RecoveryVerification

Renames and re-exports [Verification](./Recovery#verification-1)

***

### RespondApprovalInput

Renames and re-exports [RespondInput](./Approval#respondinput-1)

***

### SessionConflict

Re-exports [SessionConflict](../../host#sessionconflict)

***

### SessionCursorExpired

Re-exports [SessionCursorExpired](../../host#sessioncursorexpired)

***

### SessionError

Re-exports [SessionError](./HostSession#sessionerror)

***

### SessionEventsError

Re-exports [SessionEventsError](./HostSession#sessioneventserror)

***

### SessionEventsInput

Re-exports [SessionEventsInput](./HostSession#sessioneventsinput)

***

### SessionNotFound

Re-exports [SessionNotFound](../../host#sessionnotfound)

***

### SessionSubscriberLagged

Re-exports [SessionSubscriberLagged](../../host#sessionsubscriberlagged)

***

### StartEvent

Re-exports [StartEvent](../../generalist/namespaces/Agent#startevent)

***

### StartOptions

Re-exports [StartOptions](../../generalist/namespaces/Agent#startoptions)

***

### SteeringReceipt

Re-exports [SteeringReceipt](./Steering#steeringreceipt-1)

***

### UnknownResolution

Re-exports [UnknownResolution](./Recovery#unknownresolution-1)
