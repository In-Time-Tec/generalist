[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ModelTelemetry

# ModelTelemetry

## Classes

### InvocationLifecycle

#### Extends

- `InvocationLifecycle_base`

#### Constructors

##### Constructor

> **new InvocationLifecycle**(`_`): [`InvocationLifecycle`](#invocationlifecycle)

###### Parameters

###### \_

`never`

###### Returns

[`InvocationLifecycle`](#invocationlifecycle)

###### Inherited from

`InvocationLifecycle_base.constructor`

***

### InvocationLifecycleFailed

#### Extends

- `InvocationLifecycleFailed_base`

#### Constructors

##### Constructor

> **new InvocationLifecycleFailed**(...`args`): [`InvocationLifecycleFailed`](#invocationlifecyclefailed)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`InvocationLifecycleFailed`](#invocationlifecyclefailed)

###### Inherited from

`InvocationLifecycleFailed_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`InvocationLifecycleFailed_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`InvocationLifecycleFailed_base.message`

***

### Sink

Host sink for ordered, backpressured lifecycle delivery. Deduplicate by `(sessionId, deliveryId)`.

#### Extends

- `Sink_base`

#### Constructors

##### Constructor

> **new Sink**(`_`): [`Sink`](#sink)

###### Parameters

###### \_

`never`

###### Returns

[`Sink`](#sink)

###### Inherited from

`Sink_base.constructor`

***

### SinkFailed

Host telemetry delivery failure. A remote failure can be ambiguous; reconcile with the sink.

#### Extends

- `SinkFailed_base`

#### Constructors

##### Constructor

> **new SinkFailed**(...`args`): [`SinkFailed`](#sinkfailed)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SinkFailed`](#sinkfailed)

###### Inherited from

`SinkFailed_base.constructor`

#### Properties

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`SinkFailed_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SinkFailed_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SinkFailed_base.message`

## Interfaces

### Instrumentation

The active loop's model-call telemetry seam.

#### Properties

##### emit

> `readonly` **emit**: (`event`) => `Effect`\<`void`\>

###### Parameters

###### event

[`EventPayload`](#eventpayload)

###### Returns

`Effect`\<`void`\>

##### wrap

> `readonly` **wrap**: (`model`) => `Service`

###### Parameters

###### model

`Service`

###### Returns

`Service`

***

### SummaryCallCell

Mutable cell recording the model call a compaction pass issued for its summary.

#### Properties

##### current

> **current**: `string` \| `undefined`

## Type Aliases

### AttemptCompleted

> **AttemptCompleted** = *typeof* `AttemptCompleted.Type`

A provider invocation finished. A completed attempt always
carries the provider's terminal `finish` part, so usage, `usageAt`, and
`finishReason` are required; an attempt whose stream ended without one is
reported as `AttemptFailed` with category `truncated-stream`. Absent
request correlation and service tier fields mean unknown, never zero.
`usageAt` is sampled when provider-reported usage was received, which can
precede stream completion.

***

### AttemptFailed

> **AttemptFailed** = *typeof* `AttemptFailed.Type`

A provider invocation failed with a bounded category.

***

### AttemptFirstOutput

> **AttemptFirstOutput** = *typeof* `AttemptFirstOutput.Type`

The first reasoning, non-empty text, or tool-call output of one attempt; at
most one event per kind. Text lifecycle starts and empty deltas do not count.

***

### AttemptStarted

> **AttemptStarted** = *typeof* `AttemptStarted.Type`

One provider invocation within a model call began. `attempt` is 0-based.

***

### CallCompleted

> **CallCompleted** = *typeof* `CallCompleted.Type`

The model call reached a successful terminal outcome.

***

### CallFailed

> **CallFailed** = *typeof* `CallFailed.Type`

The model call reached a failed terminal outcome. `category`
and `classification` are decided the same way as on `AttemptFailed`, so
a consumer never has to infer retryability from an absent field. The two
levels differ only when resilience refuses to replay a retryable failure
because output already escaped: the attempt reports the failure's own
classification while the call reports `terminal`.

***

### CallPurpose

> **CallPurpose** = *typeof* `CallPurpose.Type`

Bounded purpose of one model call issued by the loop.

***

### CallStarted

> **CallStarted** = *typeof* `CallStarted.Type`

A model call began. One call spans every provider attempt made
for one prepared input. All timestamps are epoch milliseconds sampled from
the Effect Clock at the operation boundary.

***

### CompactionApplied

> **CompactionApplied** = *typeof* `CompactionApplied.Type`

A compaction pass produced its result. Session checkpoint and
projection application follow, and their failure fails the run typed.
`summaryModelCallId` names the summary model call when one ran; that call
also carries this pass's `compactionId` on its `CallStarted` event.

***

### CompactionCommit

> **CompactionCommit** = *typeof* `CompactionCommit.Type`

Atomic checkpoint record joining a compaction pass to its telemetry and projection.

***

### CompactionFailed

> **CompactionFailed** = *typeof* `CompactionFailed.Type`

A compaction pass failed or was interrupted after work began.

***

### CompactionKind

> **CompactionKind** = *typeof* `CompactionKind.Type`

How a completed compaction pass reduced context.

***

### CompactionSkipped

> **CompactionSkipped** = *typeof* `CompactionSkipped.Type`

A started compaction pass found no projection change to apply.

***

### CompactionStarted

> **CompactionStarted** = *typeof* `CompactionStarted.Type`

A compaction pass that decided to do work began.

***

### CompactionTrigger

> **CompactionTrigger** = *typeof* `CompactionTrigger.Type`

What caused a compaction pass to run.

***

### DeliveryBatch

> **DeliveryBatch** = *typeof* `DeliveryBatch.Type`

One ordered telemetry delivery batch scoped to its agent session.

***

### Event

> **Event** = *typeof* `Event.Type`

Closed union of model-call, retry, and compaction telemetry
events. Events carry timestamps sampled at their real operation boundary and
are delivered in causal order within the agent event stream, flushed at the
next event boundary or at stream end.

***

### EventPayload

> **EventPayload** = `WithoutDeliveryId`\<[`Event`](#event)\>

Lifecycle payload before the run assigns its stable delivery identifier.

***

### FailureCategory

> **FailureCategory** = *typeof* `FailureCategory.Type`

Bounded provider-neutral model failure category.

***

### FailureClassification

> **FailureClassification** = *typeof* `FailureClassification.Type`

Classification a retry decision was based on.

***

### FailureDisposition

> **FailureDisposition** = *typeof* `FailureDisposition.Type`

Decision taken after a provider attempt failed.

***

### FallbackScheduled

> **FallbackScheduled** = *typeof* `FallbackScheduled.Type`

An unavailable candidate was exhausted before any replay-sensitive output escaped.

***

### FirstOutputKind

> **FirstOutputKind** = *typeof* `FirstOutputKind.Type`

Kind of the first output part produced by a model attempt.

***

### ModelInvocationCompleted

> **ModelInvocationCompleted** = *typeof* `ModelInvocationCompleted.Type`

***

### ModelInvocationFailed

> **ModelInvocationFailed** = *typeof* `ModelInvocationFailed.Type`

***

### ModelInvocationMethod

> **ModelInvocationMethod** = *typeof* `ModelInvocationMethod.Type`

***

### ModelInvocationStarted

> **ModelInvocationStarted** = *typeof* `ModelInvocationStarted.Type`

***

### ProviderUsage

> **ProviderUsage** = `ProviderUsageValue`

***

### RetryReason

> **RetryReason** = *typeof* `RetryReason.Type`

Bounded reason a model attempt retry was scheduled.

***

### RetryScheduled

> **RetryScheduled** = *typeof* `RetryScheduled.Type`

A retry of the model call was accepted. `attempt` is the
0-based ordinal of the attempt that failed; emitted before the backoff
sleep. `delayMillis` is the accepted backoff delay.

## Variables

### AttemptCompleted

> `const` **AttemptCompleted**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptCompleted"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `completedAt`: `Schema.Finite`; `deliveryId`: `Schema.String`; `finishReason`: `Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `providerMetadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `requestId`: `Schema.optionalKey`\<`Schema.String`\>; `responseModel`: `Schema.optionalKey`\<`Schema.String`\>; `serviceTier`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; `usage`: *typeof* `Response.Usage`; `usageAt`: `Schema.Finite`; \}\>

A provider invocation finished. A completed attempt always
carries the provider's terminal `finish` part, so usage, `usageAt`, and
`finishReason` are required; an attempt whose stream ended without one is
reported as `AttemptFailed` with category `truncated-stream`. Absent
request correlation and service tier fields mean unknown, never zero.
`usageAt` is sampled when provider-reported usage was received, which can
precede stream completion.

***

### AttemptFailed

> `const` **AttemptFailed**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptFailed"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `category`: `Schema.Literals`\<readonly \[`"authentication"`, `"rate-limit"`, `"transport"`, `"provider-response"`, `"stream-decode"`, `"truncated-stream"`, `"context-overflow"`, `"invalid-tool-call"`, `"token-budget"`, `"timeout"`, `"cancellation"`, `"unknown"`\]\>; `classification`: `Schema.Literals`\<readonly \[`"transient"`, `"terminal"`\]\>; `deliveryId`: `Schema.String`; `disposition`: `Schema.Literals`\<readonly \[`"retry"`, `"fallback"`, `"terminal"`\]\>; `failedAt`: `Schema.Finite`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `providerUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `outputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `totalTokens`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; \}\>

A provider invocation failed with a bounded category.

***

### AttemptFirstOutput

> `const` **AttemptFirstOutput**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptFirstOutput"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `deliveryId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"reasoning"`, `"text"`, `"tool-call"`\]\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>

The first reasoning, non-empty text, or tool-call output of one attempt; at
most one event per kind. Text lifecycle starts and empty deltas do not count.

***

### AttemptStarted

> `const` **AttemptStarted**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptStarted"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `deliveryId`: `Schema.String`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `startedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>

One provider invocation within a model call began. `attempt` is 0-based.

***

### CallCompleted

> `const` **CallCompleted**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallCompleted"`\>; `attempts`: `Schema.Int`; `completedAt`: `Schema.Finite`; `deliveryId`: `Schema.String`; `failedAttemptUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `outputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `totalTokens`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>\>; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>\>; `modelCallId`: `Schema.String`; `purpose`: `Schema.Literals`\<readonly \[`"conversation"`, `"structured-output"`, `"compaction-summary"`\]\>; `turn`: `Schema.Finite`; `usage`: `Schema.optionalKey`\<*typeof* `Response.Usage`\>; \}\>

The model call reached a successful terminal outcome.

***

### CallFailed

> `const` **CallFailed**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallFailed"`\>; `attempts`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[`"authentication"`, `"rate-limit"`, `"transport"`, `"provider-response"`, `"stream-decode"`, `"truncated-stream"`, `"context-overflow"`, `"invalid-tool-call"`, `"token-budget"`, `"timeout"`, `"cancellation"`, `"unknown"`\]\>; `classification`: `Schema.Literals`\<readonly \[`"transient"`, `"terminal"`\]\>; `deliveryId`: `Schema.String`; `failedAt`: `Schema.Finite`; `failedAttemptUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `outputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `totalTokens`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>\>; `modelCallId`: `Schema.String`; `purpose`: `Schema.Literals`\<readonly \[`"conversation"`, `"structured-output"`, `"compaction-summary"`\]\>; `turn`: `Schema.Finite`; \}\>

The model call reached a failed terminal outcome. `category`
and `classification` are decided the same way as on `AttemptFailed`, so
a consumer never has to infer retryability from an absent field. The two
levels differ only when resilience refuses to replay a retryable failure
because output already escaped: the attempt reports the failure's own
classification while the call reports `terminal`.

***

### CallPurpose

> `const` **CallPurpose**: `Schema.Literals`\<readonly \[`"conversation"`, `"structured-output"`, `"compaction-summary"`\]\>

Bounded purpose of one model call issued by the loop.

***

### CallStarted

> `const` **CallStarted**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallStarted"`\>; `compactionId`: `Schema.optionalKey`\<`Schema.String`\>; `deliveryId`: `Schema.String`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `purpose`: `Schema.Literals`\<readonly \[`"conversation"`, `"structured-output"`, `"compaction-summary"`\]\>; `startedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>

A model call began. One call spans every provider attempt made
for one prepared input. All timestamps are epoch milliseconds sampled from
the Effect Clock at the operation boundary.

***

### classifyFailureCategory

> `const` **classifyFailureCategory**: \<`E`\>(`error`) => [`FailureCategory`](#failurecategory)

Map a model failure onto the bounded cross-provider category.

#### Type Parameters

##### E

`E`

#### Parameters

##### error

`E`

#### Returns

[`FailureCategory`](#failurecategory)

***

### CompactionApplied

> `const` **CompactionApplied**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionApplied"`\>; `appliedAt`: `Schema.Finite`; `checkpointId`: `Schema.String`; `commit`: `Schema.Struct`\<\{ `checkpointId`: `Schema.String`; `compactionId`: `Schema.String`; `contextTokensAfter`: `Schema.optionalKey`\<`Schema.Finite`\>; `contextTokensBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `entriesAfter`: `Schema.optionalKey`\<`Schema.Finite`\>; `entriesBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `summaryModelCallId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"microcompact"`, `"summarize"`\]\>; `turn`: `Schema.Finite`; \}\>

A compaction pass produced its result. Session checkpoint and
projection application follow, and their failure fails the run typed.
`summaryModelCallId` names the summary model call when one ran; that call
also carries this pass's `compactionId` on its `CallStarted` event.

***

### CompactionCommit

> `const` **CompactionCommit**: `Schema.Struct`\<\{ `checkpointId`: `Schema.String`; `compactionId`: `Schema.String`; `contextTokensAfter`: `Schema.optionalKey`\<`Schema.Finite`\>; `contextTokensBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `entriesAfter`: `Schema.optionalKey`\<`Schema.Finite`\>; `entriesBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `summaryModelCallId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

Atomic checkpoint record joining a compaction pass to its telemetry and projection.

***

### CompactionFailed

> `const` **CompactionFailed**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionFailed"`\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `failedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>

A compaction pass failed or was interrupted after work began.

***

### CompactionKind

> `const` **CompactionKind**: `Schema.Literals`\<readonly \[`"microcompact"`, `"summarize"`, `"unchanged"`\]\>

How a completed compaction pass reduced context.

***

### CompactionSkipped

> `const` **CompactionSkipped**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionSkipped"`\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `skippedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>

A started compaction pass found no projection change to apply.

***

### CompactionStarted

> `const` **CompactionStarted**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionStarted"`\>; `compactionId`: `Schema.String`; `contextTokensBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `deliveryId`: `Schema.String`; `entriesBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `startedAt`: `Schema.Finite`; `trigger`: `Schema.Literals`\<readonly \[`"threshold"`, `"overflow"`\]\>; `turn`: `Schema.Finite`; \}\>

A compaction pass that decided to do work began.

***

### CompactionTrigger

> `const` **CompactionTrigger**: `Schema.Literals`\<readonly \[`"threshold"`, `"overflow"`\]\>

What caused a compaction pass to run.

***

### CurrentCompactionId

> `const` **CurrentCompactionId**: `Context.Reference`\<`string` \| `undefined`\>

Compaction pass identifier stamped onto model calls it issues.

***

### CurrentInstrumentation

> `const` **CurrentInstrumentation**: `Context.Reference`\<[`Instrumentation`](#instrumentation) \| `undefined`\>

The instrumentation of the enclosing agent run, when present.

***

### CurrentPurpose

> `const` **CurrentPurpose**: `Context.Reference`\<[`CallPurpose`](#callpurpose)\>

Purpose stamped onto model calls issued within the current region.

***

### CurrentSummaryCall

> `const` **CurrentSummaryCall**: `Context.Reference`\<[`SummaryCallCell`](#summarycallcell) \| `undefined`\>

Cell a compaction pass provides to learn its summary model-call id.

***

### DeliveryBatch

> `const` **DeliveryBatch**: `Schema.Struct`\<\{ `events`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallStarted"`\>; `compactionId`: `Schema.optionalKey`\<`Schema.String`\>; `deliveryId`: `Schema.String`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `purpose`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `startedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptStarted"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `deliveryId`: `Schema.String`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `startedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptFirstOutput"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `deliveryId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptCompleted"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `completedAt`: `Schema.Finite`; `deliveryId`: `Schema.String`; `finishReason`: `Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `providerMetadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<...\>\>\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `requestId`: `Schema.optionalKey`\<`Schema.String`\>; `responseModel`: `Schema.optionalKey`\<`Schema.String`\>; `serviceTier`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; `usage`: *typeof* `Response.Usage`; `usageAt`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptFailed"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `category`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>; `classification`: `Schema.Literals`\<readonly \[..., ...\]\>; `deliveryId`: `Schema.String`; `disposition`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `failedAt`: `Schema.Finite`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `providerUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: ...; `outputTokens`: ...; `totalTokens`: ...; \}\>\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelRetryScheduled"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>; `delayMillis`: `Schema.Finite`; `deliveryId`: `Schema.String`; `modelCallId`: `Schema.String`; `reason`: `Schema.Literals`\<readonly \[..., ...\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelFallbackScheduled"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>; `deliveryId`: `Schema.String`; `fromCandidate`: `Schema.Int`; `fromModel`: `Schema.String`; `fromProvider`: `Schema.String`; `fromRegistrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `modelCallId`: `Schema.String`; `toCandidate`: `Schema.Int`; `toModel`: `Schema.String`; `toProvider`: `Schema.String`; `toRegistrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallCompleted"`\>; `attempts`: `Schema.Int`; `completedAt`: `Schema.Finite`; `deliveryId`: `Schema.String`; `failedAttemptUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: ...; `outputTokens`: ...; `totalTokens`: ...; \}\>\>; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[..., ..., ..., ..., ..., ..., ..., ...\]\>\>; `modelCallId`: `Schema.String`; `purpose`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `turn`: `Schema.Finite`; `usage`: `Schema.optionalKey`\<*typeof* `Response.Usage`\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallFailed"`\>; `attempts`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>; `classification`: `Schema.Literals`\<readonly \[..., ...\]\>; `deliveryId`: `Schema.String`; `failedAt`: `Schema.Finite`; `failedAttemptUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: ...; `outputTokens`: ...; `totalTokens`: ...; \}\>\>; `modelCallId`: `Schema.String`; `purpose`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionStarted"`\>; `compactionId`: `Schema.String`; `contextTokensBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `deliveryId`: `Schema.String`; `entriesBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `startedAt`: `Schema.Finite`; `trigger`: `Schema.Literals`\<readonly \[..., ...\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionSkipped"`\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `skippedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionApplied"`\>; `appliedAt`: `Schema.Finite`; `checkpointId`: `Schema.String`; `commit`: `Schema.Struct`\<\{ `checkpointId`: `Schema.String`; `compactionId`: `Schema.String`; `contextTokensAfter`: `Schema.optionalKey`\<...\>; `contextTokensBefore`: `Schema.optionalKey`\<...\>; `entriesAfter`: `Schema.optionalKey`\<...\>; `entriesBefore`: `Schema.optionalKey`\<...\>; `summaryModelCallId`: `Schema.optionalKey`\<...\>; \}\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ...\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionFailed"`\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `failedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>\]\>\>; `sessionId`: `Schema.String`; \}\>

One ordered telemetry delivery batch scoped to its agent session.

***

### Event

> `const` **Event**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallStarted"`\>; `compactionId`: `Schema.optionalKey`\<`Schema.String`\>; `deliveryId`: `Schema.String`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `purpose`: `Schema.Literals`\<readonly \[`"conversation"`, `"structured-output"`, `"compaction-summary"`\]\>; `startedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptStarted"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `deliveryId`: `Schema.String`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `startedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptFirstOutput"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `deliveryId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"reasoning"`, `"text"`, `"tool-call"`\]\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptCompleted"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `completedAt`: `Schema.Finite`; `deliveryId`: `Schema.String`; `finishReason`: `Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `providerMetadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `requestId`: `Schema.optionalKey`\<`Schema.String`\>; `responseModel`: `Schema.optionalKey`\<`Schema.String`\>; `serviceTier`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; `usage`: *typeof* `Response.Usage`; `usageAt`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptFailed"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `category`: `Schema.Literals`\<readonly \[`"authentication"`, `"rate-limit"`, `"transport"`, `"provider-response"`, `"stream-decode"`, `"truncated-stream"`, `"context-overflow"`, `"invalid-tool-call"`, `"token-budget"`, `"timeout"`, `"cancellation"`, `"unknown"`\]\>; `classification`: `Schema.Literals`\<readonly \[`"transient"`, `"terminal"`\]\>; `deliveryId`: `Schema.String`; `disposition`: `Schema.Literals`\<readonly \[`"retry"`, `"fallback"`, `"terminal"`\]\>; `failedAt`: `Schema.Finite`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `providerUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `outputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `totalTokens`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelRetryScheduled"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[`"authentication"`, `"rate-limit"`, `"transport"`, `"provider-response"`, `"stream-decode"`, `"truncated-stream"`, `"context-overflow"`, `"invalid-tool-call"`, `"token-budget"`, `"timeout"`, `"cancellation"`, `"unknown"`\]\>; `delayMillis`: `Schema.Finite`; `deliveryId`: `Schema.String`; `modelCallId`: `Schema.String`; `reason`: `Schema.Literals`\<readonly \[`"provider-resilience"`, `"invalid-tool-call-correction"`\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelFallbackScheduled"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[`"authentication"`, `"rate-limit"`, `"transport"`, `"provider-response"`, `"stream-decode"`, `"truncated-stream"`, `"context-overflow"`, `"invalid-tool-call"`, `"token-budget"`, `"timeout"`, `"cancellation"`, `"unknown"`\]\>; `deliveryId`: `Schema.String`; `fromCandidate`: `Schema.Int`; `fromModel`: `Schema.String`; `fromProvider`: `Schema.String`; `fromRegistrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `modelCallId`: `Schema.String`; `toCandidate`: `Schema.Int`; `toModel`: `Schema.String`; `toProvider`: `Schema.String`; `toRegistrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallCompleted"`\>; `attempts`: `Schema.Int`; `completedAt`: `Schema.Finite`; `deliveryId`: `Schema.String`; `failedAttemptUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `outputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `totalTokens`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>\>; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>\>; `modelCallId`: `Schema.String`; `purpose`: `Schema.Literals`\<readonly \[`"conversation"`, `"structured-output"`, `"compaction-summary"`\]\>; `turn`: `Schema.Finite`; `usage`: `Schema.optionalKey`\<*typeof* `Response.Usage`\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallFailed"`\>; `attempts`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[`"authentication"`, `"rate-limit"`, `"transport"`, `"provider-response"`, `"stream-decode"`, `"truncated-stream"`, `"context-overflow"`, `"invalid-tool-call"`, `"token-budget"`, `"timeout"`, `"cancellation"`, `"unknown"`\]\>; `classification`: `Schema.Literals`\<readonly \[`"transient"`, `"terminal"`\]\>; `deliveryId`: `Schema.String`; `failedAt`: `Schema.Finite`; `failedAttemptUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `outputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `totalTokens`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>\>; `modelCallId`: `Schema.String`; `purpose`: `Schema.Literals`\<readonly \[`"conversation"`, `"structured-output"`, `"compaction-summary"`\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionStarted"`\>; `compactionId`: `Schema.String`; `contextTokensBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `deliveryId`: `Schema.String`; `entriesBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `startedAt`: `Schema.Finite`; `trigger`: `Schema.Literals`\<readonly \[`"threshold"`, `"overflow"`\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionSkipped"`\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `skippedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionApplied"`\>; `appliedAt`: `Schema.Finite`; `checkpointId`: `Schema.String`; `commit`: `Schema.Struct`\<\{ `checkpointId`: `Schema.String`; `compactionId`: `Schema.String`; `contextTokensAfter`: `Schema.optionalKey`\<`Schema.Finite`\>; `contextTokensBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `entriesAfter`: `Schema.optionalKey`\<`Schema.Finite`\>; `entriesBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `summaryModelCallId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"microcompact"`, `"summarize"`\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionFailed"`\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `failedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>\]\>

Closed union of model-call, retry, and compaction telemetry
events. Events carry timestamps sampled at their real operation boundary and
are delivered in causal order within the agent event stream, flushed at the
next event boundary or at stream end.

***

### FailureCategory

> `const` **FailureCategory**: `Schema.Literals`\<readonly \[`"authentication"`, `"rate-limit"`, `"transport"`, `"provider-response"`, `"stream-decode"`, `"truncated-stream"`, `"context-overflow"`, `"invalid-tool-call"`, `"token-budget"`, `"timeout"`, `"cancellation"`, `"unknown"`\]\>

Bounded provider-neutral model failure category.

***

### FailureClassification

> `const` **FailureClassification**: `Schema.Literals`\<readonly \[`"transient"`, `"terminal"`\]\>

Classification a retry decision was based on.

***

### FailureDisposition

> `const` **FailureDisposition**: `Schema.Literals`\<readonly \[`"retry"`, `"fallback"`, `"terminal"`\]\>

Decision taken after a provider attempt failed.

***

### FallbackScheduled

> `const` **FallbackScheduled**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelFallbackScheduled"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[`"authentication"`, `"rate-limit"`, `"transport"`, `"provider-response"`, `"stream-decode"`, `"truncated-stream"`, `"context-overflow"`, `"invalid-tool-call"`, `"token-budget"`, `"timeout"`, `"cancellation"`, `"unknown"`\]\>; `deliveryId`: `Schema.String`; `fromCandidate`: `Schema.Int`; `fromModel`: `Schema.String`; `fromProvider`: `Schema.String`; `fromRegistrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `modelCallId`: `Schema.String`; `toCandidate`: `Schema.Int`; `toModel`: `Schema.String`; `toProvider`: `Schema.String`; `toRegistrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; \}\>

An unavailable candidate was exhausted before any replay-sensitive output escaped.

***

### FirstOutputKind

> `const` **FirstOutputKind**: `Schema.Literals`\<readonly \[`"reasoning"`, `"text"`, `"tool-call"`\]\>

Kind of the first output part produced by a model attempt.

***

### generateId

> `const` **generateId**: `Effect.Effect`\<`string`\>

Generate one telemetry identifier via `IdGenerator`, defaulting when absent.

***

### isInvocationLifecycleFailed

> `const` **isInvocationLifecycleFailed**: \<`I`\>(`input`) => `input is I & InvocationLifecycleFailed`

#### Type Parameters

##### I

`I`

#### Parameters

##### input

`I`

#### Returns

`input is I & InvocationLifecycleFailed`

***

### layerInvocationLifecycleNoop

> `const` **layerInvocationLifecycleNoop**: `Layer.Layer`\<[`InvocationLifecycle`](#invocationlifecycle)\>

***

### layerSinkNoop

> `const` **layerSinkNoop**: `Layer.Layer`\<[`Sink`](#sink)\>

No-op host delivery sink.

***

### ModelInvocationCompleted

> `const` **ModelInvocationCompleted**: `Schema.Struct`\<\{ `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `completedAt`: `Schema.Finite`; `finishReason`: `Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>; `logicalOperationId`: `Schema.String`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `providerMetadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `requestId`: `Schema.optionalKey`\<`Schema.String`\>; `responseModel`: `Schema.optionalKey`\<`Schema.String`\>; `usage`: *typeof* `Response.Usage`; \}\>

***

### ModelInvocationFailed

> `const` **ModelInvocationFailed**: `Schema.Struct`\<\{ `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `category`: `Schema.Literals`\<readonly \[`"authentication"`, `"rate-limit"`, `"transport"`, `"provider-response"`, `"stream-decode"`, `"truncated-stream"`, `"context-overflow"`, `"invalid-tool-call"`, `"token-budget"`, `"timeout"`, `"cancellation"`, `"unknown"`\]\>; `classification`: `Schema.Literals`\<readonly \[`"transient"`, `"terminal"`\]\>; `disposition`: `Schema.Literals`\<readonly \[`"retry"`, `"fallback"`, `"terminal"`\]\>; `failedAt`: `Schema.Finite`; `logicalOperationId`: `Schema.String`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

***

### ModelInvocationMethod

> `const` **ModelInvocationMethod**: `Schema.Literals`\<readonly \[`"generateText"`, `"generateObject"`, `"streamText"`\]\>

***

### ModelInvocationStarted

> `const` **ModelInvocationStarted**: `Schema.Struct`\<\{ `attempt`: `Schema.Int`; `callOrdinal`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `logicalOperationId`: `Schema.String`; `method`: `Schema.Literals`\<readonly \[`"generateText"`, `"generateObject"`, `"streamText"`\]\>; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `purpose`: `Schema.Literals`\<readonly \[`"conversation"`, `"structured-output"`, `"compaction-summary"`\]\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `startedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>

***

### ProviderUsage

> `const` **ProviderUsage**: `Schema.Struct`\<\{ `inputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `outputTokens`: `Schema.optionalKey`\<`Schema.Int`\>; `totalTokens`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>

***

### RetryReason

> `const` **RetryReason**: `Schema.Literals`\<readonly \[`"provider-resilience"`, `"invalid-tool-call-correction"`\]\>

Bounded reason a model attempt retry was scheduled.

***

### RetryScheduled

> `const` **RetryScheduled**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelRetryScheduled"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[`"authentication"`, `"rate-limit"`, `"transport"`, `"provider-response"`, `"stream-decode"`, `"truncated-stream"`, `"context-overflow"`, `"invalid-tool-call"`, `"token-budget"`, `"timeout"`, `"cancellation"`, `"unknown"`\]\>; `delayMillis`: `Schema.Finite`; `deliveryId`: `Schema.String`; `modelCallId`: `Schema.String`; `reason`: `Schema.Literals`\<readonly \[`"provider-resilience"`, `"invalid-tool-call-correction"`\]\>; `turn`: `Schema.Finite`; \}\>

A retry of the model call was accepted. `attempt` is the
0-based ordinal of the attempt that failed; emitted before the backoff
sleep. `delayMillis` is the accepted backoff delay.
