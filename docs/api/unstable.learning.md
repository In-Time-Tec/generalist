[**generalist**](./index)

***

[generalist](./index) / unstable.learning

# unstable.learning

## Classes

<a id="consolidationinvalid"></a>

### ConsolidationInvalid

A consolidation model returned a memory rewrite that could not preserve version history.

#### Extends

- `ConsolidationInvalid_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ConsolidationInvalid**(...`args`): [`ConsolidationInvalid`](#consolidationinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ConsolidationInvalid`](#consolidationinvalid)

###### Inherited from

`ConsolidationInvalid_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ConsolidationInvalid_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`ConsolidationInvalid_base.message`

## Interfaces

<a id="applyhandlers"></a>

### ApplyHandlers

**`Experimental`**

Plain Effect handlers selected only by proposal tag.

#### Type Parameters

##### R

`R` = `never`

##### E

`E` = `never`

#### Properties

<a id="authorskill"></a>

##### AuthorSkill

> `readonly` **AuthorSkill**: (`proposal`) => `Effect`\<`void`, `E`, `R`\>

**`Experimental`**

###### Parameters

###### proposal

###### content

`string`

###### evidence

readonly `object`[]

###### name

`string`

###### Returns

`Effect`\<`void`, `E`, `R`\>

<a id="exporttrajectory"></a>

##### ExportTrajectory

> `readonly` **ExportTrajectory**: (`proposal`) => `Effect`\<`void`, `E`, `R`\>

**`Experimental`**

###### Parameters

###### proposal

###### format

`"jsonl"`

###### runId

`string`

###### Returns

`Effect`\<`void`, `E`, `R`\>

<a id="forget"></a>

##### Forget

> `readonly` **Forget**: (`proposal`) => `Effect`\<`void`, `E`, `R`\>

**`Experimental`**

###### Parameters

###### proposal

###### evidence

readonly `object`[]

###### memory

\{ `id`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; \}

###### memory.id

`string`

###### memory.key

\{ `agent`: `string`; `subject`: `string`; \}

###### memory.key.agent

`string`

###### memory.key.subject

`string`

###### Returns

`Effect`\<`void`, `E`, `R`\>

<a id="refineinstruction"></a>

##### RefineInstruction

> `readonly` **RefineInstruction**: (`proposal`) => `Effect`\<`void`, `E`, `R`\>

**`Experimental`**

###### Parameters

###### proposal

###### diff

`string`

###### evidence

readonly `object`[]

###### target

`string`

###### Returns

`Effect`\<`void`, `E`, `R`\>

<a id="remember"></a>

##### Remember

> `readonly` **Remember**: (`proposal`) => `Effect`\<`void`, `E`, `R`\>

**`Experimental`**

###### Parameters

###### proposal

###### evidence

readonly `object`[]

###### memory

\{ `entryId?`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; `supersedes?`: `number`; `terminal`: `boolean`; `transcript`: `Prompt`; `turn`: `number`; \}

###### memory.entryId?

`string`

###### memory.key

\{ `agent`: `string`; `subject`: `string`; \}

###### memory.key.agent

`string`

###### memory.key.subject

`string`

###### memory.supersedes?

`number`

###### memory.terminal

`boolean`

###### memory.transcript

`Prompt`

###### memory.turn

`number`

###### Returns

`Effect`\<`void`, `E`, `R`\>

***

<a id="consolidateoptions"></a>

### ConsolidateOptions

**`Experimental`**

Scheduled semantic-memory consolidation configuration.

#### Properties

<a id="budget"></a>

##### budget?

> `readonly` `optional` **budget?**: [`Input`](./generalist/namespaces/RunBudget#input)

**`Experimental`**

<a id="maxproposals"></a>

##### maxProposals

> `readonly` **maxProposals**: `number`

**`Experimental`**

<a id="model"></a>

##### model

> `readonly` **model**: `string` \| [`ModelSelection`](./generalist/namespaces/ModelRegistry#modelselection)

**`Experimental`**

<a id="schedule"></a>

##### schedule

> `readonly` **schedule**: `string`

**`Experimental`**

<a id="window"></a>

##### window

> `readonly` **window**: `Input`

**`Experimental`**

***

<a id="consolidationapplyhandlers"></a>

### ConsolidationApplyHandlers

**`Experimental`**

Handlers for the proposal kinds emitted by scheduled consolidation.

#### Type Parameters

##### R

`R` = `never`

##### E

`E` = `never`

#### Properties

<a id="forget-1"></a>

##### Forget

> `readonly` **Forget**: (`proposal`) => `Effect`\<`void`, `E`, `R`\>

**`Experimental`**

###### Parameters

###### proposal

###### evidence

readonly `object`[]

###### memory

\{ `id`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; \}

###### memory.id

`string`

###### memory.key

\{ `agent`: `string`; `subject`: `string`; \}

###### memory.key.agent

`string`

###### memory.key.subject

`string`

###### Returns

`Effect`\<`void`, `E`, `R`\>

<a id="refineinstruction-1"></a>

##### RefineInstruction

> `readonly` **RefineInstruction**: (`proposal`) => `Effect`\<`void`, `E`, `R`\>

**`Experimental`**

###### Parameters

###### proposal

###### diff

`string`

###### evidence

readonly `object`[]

###### target

`string`

###### Returns

`Effect`\<`void`, `E`, `R`\>

<a id="remember-1"></a>

##### Remember

> `readonly` **Remember**: (`proposal`) => `Effect`\<`void`, `E`, `R`\>

**`Experimental`**

###### Parameters

###### proposal

###### evidence

readonly `object`[]

###### memory

\{ `entryId?`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; `supersedes?`: `number`; `terminal`: `boolean`; `transcript`: `Prompt`; `turn`: `number`; \}

###### memory.entryId?

`string`

###### memory.key

\{ `agent`: `string`; `subject`: `string`; \}

###### memory.key.agent

`string`

###### memory.key.subject

`string`

###### memory.supersedes?

`number`

###### memory.terminal

`boolean`

###### memory.transcript

`Prompt`

###### memory.turn

`number`

###### Returns

`Effect`\<`void`, `E`, `R`\>

***

<a id="consolidationlayeroptions"></a>

### ConsolidationLayerOptions

**`Experimental`**

#### Type Parameters

##### ApplyR

`ApplyR` = `never`

##### ApplyE

`ApplyE` = `never`

#### Properties

<a id="apply"></a>

##### apply

> `readonly` **apply**: [`ConsolidationApplyHandlers`](#consolidationapplyhandlers)\<`ApplyR`, `ApplyE`\>

**`Experimental`**

<a id="propose"></a>

##### propose

> `readonly` **propose**: `ConsolidationProposer`

**`Experimental`**

***

<a id="layeroptions"></a>

### LayerOptions

**`Experimental`**

#### Type Parameters

##### ProposeR

`ProposeR` = `never`

##### ProposeE

`ProposeE` = `never`

##### ApplyR

`ApplyR` = `never`

##### ApplyE

`ApplyE` = `never`

#### Properties

<a id="apply-1"></a>

##### apply

> `readonly` **apply**: [`ApplyHandlers`](#applyhandlers)\<`ApplyR`, `ApplyE`\>

**`Experimental`**

<a id="propose-1"></a>

##### propose

> `readonly` **propose**: (`trajectory`) => `Effect`\<readonly (\{ `diff`: `string`; `evidence`: readonly `object`[]; `target`: `string`; \} \| \{ `content`: `string`; `evidence`: readonly `object`[]; `name`: `string`; \} \| \{ `evidence`: readonly `object`[]; `memory`: \{ `entryId?`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; `supersedes?`: `number`; `terminal`: `boolean`; `transcript`: `Prompt`; `turn`: `number`; \}; \} \| \{ `evidence`: readonly `object`[]; `memory`: \{ `id`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; \}; \} \| \{ `format`: `"jsonl"`; `runId`: `string`; \})[], `ProposeE`, `ProposeR`\>

**`Experimental`**

###### Parameters

###### trajectory

###### agent

`string`

###### budget?

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

Agent budget allocation when the journal's executable manifest declares one.

###### budget.children?

`number`

###### budget.duration?

`number`

###### budget.tokens?

`number`

###### budget.toolCalls?

`number`

###### budget.usd?

`number`

###### gates

readonly `object`[]

###### input

`Prompt`

###### output

`unknown`

###### runId

`string`

###### stopReason

`string`

###### turns

readonly `object`[]

###### Returns

`Effect`\<readonly (\{ `diff`: `string`; `evidence`: readonly `object`[]; `target`: `string`; \} \| \{ `content`: `string`; `evidence`: readonly `object`[]; `name`: `string`; \} \| \{ `evidence`: readonly `object`[]; `memory`: \{ `entryId?`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; `supersedes?`: `number`; `terminal`: `boolean`; `transcript`: `Prompt`; `turn`: `number`; \}; \} \| \{ `evidence`: readonly `object`[]; `memory`: \{ `id`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; \}; \} \| \{ `format`: `"jsonl"`; `runId`: `string`; \})[], `ProposeE`, `ProposeR`\>

***

<a id="proposer-1"></a>

### Proposer

**`Experimental`**

Produce reviewable changes from one completed trajectory.

#### Type Parameters

##### R

`R` = `never`

##### E

`E` = `never`

#### Properties

<a id="propose-2"></a>

##### propose

> `readonly` **propose**: (`trajectory`) => `Effect`\<readonly (\{ `diff`: `string`; `evidence`: readonly `object`[]; `target`: `string`; \} \| \{ `content`: `string`; `evidence`: readonly `object`[]; `name`: `string`; \} \| \{ `evidence`: readonly `object`[]; `memory`: \{ `entryId?`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; `supersedes?`: `number`; `terminal`: `boolean`; `transcript`: `Prompt`; `turn`: `number`; \}; \} \| \{ `evidence`: readonly `object`[]; `memory`: \{ `id`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; \}; \} \| \{ `format`: `"jsonl"`; `runId`: `string`; \})[], `E`, `R`\>

**`Experimental`**

###### Parameters

###### trajectory

###### agent

`string`

###### budget?

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

Agent budget allocation when the journal's executable manifest declares one.

###### budget.children?

`number`

###### budget.duration?

`number`

###### budget.tokens?

`number`

###### budget.toolCalls?

`number`

###### budget.usd?

`number`

###### gates

readonly `object`[]

###### input

`Prompt`

###### output

`unknown`

###### runId

`string`

###### stopReason

`string`

###### turns

readonly `object`[]

###### Returns

`Effect`\<readonly (\{ `diff`: `string`; `evidence`: readonly `object`[]; `target`: `string`; \} \| \{ `content`: `string`; `evidence`: readonly `object`[]; `name`: `string`; \} \| \{ `evidence`: readonly `object`[]; `memory`: \{ `entryId?`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; `supersedes?`: `number`; `terminal`: `boolean`; `transcript`: `Prompt`; `turn`: `number`; \}; \} \| \{ `evidence`: readonly `object`[]; `memory`: \{ `id`: `string`; `key`: \{ `agent`: `string`; `subject`: `string`; \}; \}; \} \| \{ `format`: `"jsonl"`; `runId`: `string`; \})[], `E`, `R`\>

***

<a id="proposewithmodeloptions"></a>

### ProposeWithModelOptions

**`Experimental`**

#### Type Parameters

##### R

`R` = `never`

#### Properties

<a id="maxproposals-1"></a>

##### maxProposals?

> `readonly` `optional` **maxProposals?**: `number`

**`Experimental`**

<a id="model-1"></a>

##### model

> `readonly` **model**: `Layer`\<`LanguageModel`, `never`, `R`\>

**`Experimental`**

## Type Aliases

<a id="authorskill-1"></a>

### AuthorSkill

> **AuthorSkill** = *typeof* `AuthorSkill.Type`

**`Experimental`**

***

<a id="exporttrajectory-1"></a>

### ExportTrajectory

> **ExportTrajectory** = *typeof* `ExportTrajectory.Type`

**`Experimental`**

***

<a id="forget-2"></a>

### Forget

> **Forget** = *typeof* `Forget.Type`

**`Experimental`**

***

<a id="forgetentry"></a>

### ForgetEntry

> **ForgetEntry** = *typeof* `ForgetEntry.Type`

**`Experimental`**

***

<a id="memoryentry"></a>

### MemoryEntry

> **MemoryEntry** = *typeof* `MemoryEntry.Type`

**`Experimental`**

***

<a id="proposal"></a>

### Proposal

> **Proposal** = *typeof* `Proposal.Type`

**`Experimental`**

***

<a id="refineinstruction-2"></a>

### RefineInstruction

> **RefineInstruction** = *typeof* `RefineInstruction.Type`

**`Experimental`**

***

<a id="remember-2"></a>

### Remember

> **Remember** = *typeof* `Remember.Type`

**`Experimental`**

***

<a id="trajectoryref"></a>

### TrajectoryRef

> **TrajectoryRef** = *typeof* `TrajectoryRef.Type`

**`Experimental`**

## Variables

<a id="authorskill-2"></a>

### AuthorSkill

> `const` **AuthorSkill**: `Schema.TaggedStruct`\<`"AuthorSkill"`, \{ `content`: `Schema.String`; `evidence`: `Schema.$Array`\<`Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>\>; `name`: `Schema.String`; \}\>

**`Experimental`**

A proposed skill plus the trajectory turns supporting it.

***

<a id="consolidate"></a>

### consolidate

> `const` **consolidate**: (`options`) => `ConsolidationProposer`

**`Experimental`**

Build the scheduled journal-backed consolidation proposer used by `Learning.layer`.

#### Parameters

##### options

[`ConsolidateOptions`](#consolidateoptions)

#### Returns

`ConsolidationProposer`

***

<a id="declaration"></a>

### declaration

> `const` **declaration**: \<`ProposeR`, `ProposeE`, `ApplyR`, `ApplyE`\>(`options`) => `Effect.Effect`\<[`Declaration`](./hooks#declaration), `never`, [`Runtime`](./runtime/namespaces/Runtime#runtime) \| [`Approvals`](./approvals#approvals) \| `ProposeR` \| `ApplyR`\>

**`Experimental`**

Build one `Hooks.onRunEnd` declaration whose proposals use the hosted Runtime's nested-operation
journal. Compose it with other declarations through `Hooks.layer([...])` or a Host plugin's `hooks`.

#### Type Parameters

##### ProposeR

`ProposeR`

##### ProposeE

`ProposeE`

##### ApplyR

`ApplyR`

##### ApplyE

`ApplyE`

#### Parameters

##### options

[`LayerOptions`](#layeroptions)\<`ProposeR`, `ProposeE`, `ApplyR`, `ApplyE`\>

#### Returns

`Effect.Effect`\<[`Declaration`](./hooks#declaration), `never`, [`Runtime`](./runtime/namespaces/Runtime#runtime) \| [`Approvals`](./approvals#approvals) \| `ProposeR` \| `ApplyR`\>

***

<a id="exporttrajectory-2"></a>

### ExportTrajectory

> `const` **ExportTrajectory**: `Schema.TaggedStruct`\<`"ExportTrajectory"`, \{ `format`: `Schema.Literal`\<`"jsonl"`\>; `runId`: `Schema.String`; \}\>

**`Experimental`**

A proposed JSON Lines export of one recorded run.

***

<a id="forget-3"></a>

### Forget

> `const` **Forget**: `Schema.TaggedStruct`\<`"Forget"`, \{ `evidence`: `Schema.$Array`\<`Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>\>; `memory`: `Schema.Struct`\<\{ `id`: `Schema.String`; `key`: `Schema.Struct`\<\{ `agent`: `Schema.String`; `subject`: `Schema.String`; \}\>; \}\>; \}\>

**`Experimental`**

A proposed removal from active semantic recall.

***

<a id="forgetentry-1"></a>

### ForgetEntry

> `const` **ForgetEntry**: `Schema.Struct`\<\{ `id`: `Schema.String`; `key`: `Schema.Struct`\<\{ `agent`: `Schema.String`; `subject`: `Schema.String`; \}\>; \}\>

**`Experimental`**

Memory entry selected for removal from active recall.

***

<a id="memoryentry-1"></a>

### MemoryEntry

> `const` **MemoryEntry**: `Schema.Struct`\<\{ `entryId`: `Schema.optionalKey`\<`Schema.String`\>; `key`: `Schema.Struct`\<\{ `agent`: `Schema.String`; `subject`: `Schema.String`; \}\>; `supersedes`: `Schema.optionalKey`\<`Schema.Int`\>; `terminal`: `Schema.Boolean`; `transcript`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `turn`: `Schema.Int`; \}\>

**`Experimental`**

Memory input that an application handler may adapt to its Memory service.

***

<a id="proposal-1"></a>

### Proposal

> `const` **Proposal**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"RefineInstruction"`, \{ `diff`: `Schema.String`; `evidence`: `Schema.$Array`\<`Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>\>; `target`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AuthorSkill"`, \{ `content`: `Schema.String`; `evidence`: `Schema.$Array`\<`Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>\>; `name`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Remember"`, \{ `evidence`: `Schema.$Array`\<`Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>\>; `memory`: `Schema.Struct`\<\{ `entryId`: `Schema.optionalKey`\<`Schema.String`\>; `key`: `Schema.Struct`\<\{ `agent`: `Schema.String`; `subject`: `Schema.String`; \}\>; `supersedes`: `Schema.optionalKey`\<`Schema.Int`\>; `terminal`: `Schema.Boolean`; `transcript`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `turn`: `Schema.Int`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Forget"`, \{ `evidence`: `Schema.$Array`\<`Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>\>; `memory`: `Schema.Struct`\<\{ `id`: `Schema.String`; `key`: `Schema.Struct`\<\{ `agent`: `Schema.String`; `subject`: `Schema.String`; \}\>; \}\>; \}\>, `Schema.TaggedStruct`\<`"ExportTrajectory"`, \{ `format`: `Schema.Literal`\<`"jsonl"`\>; `runId`: `Schema.String`; \}\>\]\>

**`Experimental`**

One reviewable change proposed after a run.

***

<a id="proposewithmodel"></a>

### proposeWithModel

> `const` **proposeWithModel**: \<`R`\>(`options`) => [`Proposer`](#proposer-1)\<`R`, `AiError.AiError` \| `Schema.SchemaError`\>\[`"propose"`\]

**`Experimental`**

Ask one Effect AI model for a bounded, Schema-decoded proposal list.

#### Type Parameters

##### R

`R`

#### Parameters

##### options

[`ProposeWithModelOptions`](#proposewithmodeloptions)\<`R`\>

#### Returns

[`Proposer`](#proposer-1)\<`R`, `AiError.AiError` \| `Schema.SchemaError`\>\[`"propose"`\]

***

<a id="refineinstruction-3"></a>

### RefineInstruction

> `const` **RefineInstruction**: `Schema.TaggedStruct`\<`"RefineInstruction"`, \{ `diff`: `Schema.String`; `evidence`: `Schema.$Array`\<`Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>\>; `target`: `Schema.String`; \}\>

**`Experimental`**

A proposed instruction change plus the trajectory turns supporting it.

***

<a id="remember-3"></a>

### Remember

> `const` **Remember**: `Schema.TaggedStruct`\<`"Remember"`, \{ `evidence`: `Schema.$Array`\<`Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>\>; `memory`: `Schema.Struct`\<\{ `entryId`: `Schema.optionalKey`\<`Schema.String`\>; `key`: `Schema.Struct`\<\{ `agent`: `Schema.String`; `subject`: `Schema.String`; \}\>; `supersedes`: `Schema.optionalKey`\<`Schema.Int`\>; `terminal`: `Schema.Boolean`; `transcript`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `turn`: `Schema.Int`; \}\>; \}\>

**`Experimental`**

A proposed memory entry plus the trajectory turns supporting it.

***

<a id="trajectoryref-1"></a>

### TrajectoryRef

> `const` **TrajectoryRef**: `Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>

**`Experimental`**

One exact run turn supporting a proposed change.

## Functions

<a id="layer"></a>

### layer()

#### Call Signature

> **layer**\<`ApplyR`, `ApplyE`\>(`options`): `Layer`\<[`Hooks`](./hooks#hooks), [`DuplicateAgent`](./runtime/namespaces/Errors#duplicateagent) \| [`ConsolidationInvalid`](#consolidationinvalid) \| [`ScheduleError`](./runtime/namespaces/Runtime#scheduleerror), [`Approvals`](./approvals#approvals) \| [`Runtime`](./runtime/namespaces/Runtime#runtime) \| [`Memory`](./generalist/namespaces/Memory#memory) \| [`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry) \| `ApplyR`\>

**`Experimental`**

Provide `Hooks` consisting of the learning declaration alone. Use `declaration` when the environment
already has other hook declarations.

##### Type Parameters

###### ApplyR

`ApplyR`

###### ApplyE

`ApplyE`

##### Parameters

###### options

[`ConsolidationLayerOptions`](#consolidationlayeroptions)\<`ApplyR`, `ApplyE`\>

##### Returns

`Layer`\<[`Hooks`](./hooks#hooks), [`DuplicateAgent`](./runtime/namespaces/Errors#duplicateagent) \| [`ConsolidationInvalid`](#consolidationinvalid) \| [`ScheduleError`](./runtime/namespaces/Runtime#scheduleerror), [`Approvals`](./approvals#approvals) \| [`Runtime`](./runtime/namespaces/Runtime#runtime) \| [`Memory`](./generalist/namespaces/Memory#memory) \| [`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry) \| `ApplyR`\>

#### Call Signature

> **layer**\<`ProposeR`, `ProposeE`, `ApplyR`, `ApplyE`\>(`options`): `Layer`\<[`Hooks`](./hooks#hooks), `never`, [`Approvals`](./approvals#approvals) \| [`Runtime`](./runtime/namespaces/Runtime#runtime) \| `ProposeR` \| `ApplyR`\>

**`Experimental`**

Provide `Hooks` consisting of the learning declaration alone. Use `declaration` when the environment
already has other hook declarations.

##### Type Parameters

###### ProposeR

`ProposeR`

###### ProposeE

`ProposeE`

###### ApplyR

`ApplyR`

###### ApplyE

`ApplyE`

##### Parameters

###### options

[`LayerOptions`](#layeroptions)\<`ProposeR`, `ProposeE`, `ApplyR`, `ApplyE`\>

##### Returns

`Layer`\<[`Hooks`](./hooks#hooks), `never`, [`Approvals`](./approvals#approvals) \| [`Runtime`](./runtime/namespaces/Runtime#runtime) \| `ProposeR` \| `ApplyR`\>

## References

<a id="authorskillproposal"></a>

### AuthorSkillProposal

Renames and re-exports [AuthorSkill](#authorskill-2)

***

<a id="exporttrajectoryproposal"></a>

### ExportTrajectoryProposal

Renames and re-exports [ExportTrajectory](#exporttrajectory-2)

***

<a id="forgetentryinput"></a>

### ForgetEntryInput

Renames and re-exports [ForgetEntry](#forgetentry-1)

***

<a id="forgetproposal"></a>

### ForgetProposal

Renames and re-exports [Forget](#forget-3)

***

<a id="memoryentryinput"></a>

### MemoryEntryInput

Renames and re-exports [MemoryEntry](#memoryentry-1)

***

<a id="refineinstructionproposal"></a>

### RefineInstructionProposal

Renames and re-exports [RefineInstruction](#refineinstruction-3)

***

<a id="rememberproposal"></a>

### RememberProposal

Renames and re-exports [Remember](#remember-3)

***

<a id="trajectoryreference"></a>

### TrajectoryReference

Renames and re-exports [TrajectoryRef](#trajectoryref-1)
