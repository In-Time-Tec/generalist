[**generalist**](../../index.md)

***

[generalist](../../index.md) / [unstable.a2a](../index.md) / Projection

# Projection

## Variables

<a id="artifactfromevent"></a>

### artifactFromEvent

> `const` **artifactFromEvent**: (`event`) => `Artifact`

**`Experimental`**

Build the completion artifact update for a Runtime completion.

#### Parameters

##### event

[`RunCompleted`](../../runtime/namespaces/RunEvent.md#runcompleted)

#### Returns

`Artifact`

***

<a id="fromruntime"></a>

### fromRuntime

> `const` **fromRuntime**: \{(`runtime`, `taskId`): `Effect`\<`Task`, [`TaskProjectionFailed`](./Errors.md#taskprojectionfailed)\>; (`taskId`): (`runtime`) => `Effect`\<`Task`, [`TaskProjectionFailed`](./Errors.md#taskprojectionfailed)\>; \}

**`Experimental`**

Project one Runtime snapshot and its canonical history to an A2A Task.

#### Call Signature

> (`runtime`, `taskId`): `Effect`\<`Task`, [`TaskProjectionFailed`](./Errors.md#taskprojectionfailed)\>

##### Parameters

###### runtime

[`Service`](../../runtime/namespaces/Runtime.md#service)

###### taskId

`string`

##### Returns

`Effect`\<`Task`, [`TaskProjectionFailed`](./Errors.md#taskprojectionfailed)\>

#### Call Signature

> (`taskId`): (`runtime`) => `Effect`\<`Task`, [`TaskProjectionFailed`](./Errors.md#taskprojectionfailed)\>

##### Parameters

###### taskId

`string`

##### Returns

(`runtime`) => `Effect`\<`Task`, [`TaskProjectionFailed`](./Errors.md#taskprojectionfailed)\>

***

<a id="statefromrun"></a>

### stateFromRun

> `const` **stateFromRun**: (`run`) => `TaskState`

**`Experimental`**

Map authoritative Runtime status to A2A task state.

#### Parameters

##### run

[`RunInspection`](../../runtime/namespaces/Run.md#runinspection)

#### Returns

`TaskState`

***

<a id="statusfromevent"></a>

### statusFromEvent

> `const` **statusFromEvent**: \{(`task`, `event`): `TaskStatus` \| `undefined`; (`event`): (`task`) => `TaskStatus` \| `undefined`; \}

**`Experimental`**

Build a status update for one canonical Runtime event.

#### Call Signature

> (`task`, `event`): `TaskStatus` \| `undefined`

##### Parameters

###### task

`Task`

###### event

[`RunEvent`](../../runtime/namespaces/RunEvent.md#runevent)

##### Returns

`TaskStatus` \| `undefined`

#### Call Signature

> (`event`): (`task`) => `TaskStatus` \| `undefined`

##### Parameters

###### event

[`RunEvent`](../../runtime/namespaces/RunEvent.md#runevent)

##### Returns

(`task`) => `TaskStatus` \| `undefined`
