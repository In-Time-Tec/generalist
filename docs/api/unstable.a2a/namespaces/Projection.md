[**generalist**](../../index)

***

[generalist](../../index) / [unstable.a2a](../index) / Projection

# Projection

## Variables

<a id="artifactfromevent"></a>

### artifactFromEvent

> `const` **artifactFromEvent**: (`event`) => `Artifact`

**`Experimental`**

Build the completion artifact update for a Runtime completion.

#### Parameters

##### event

[`RunCompleted`](../../runtime/namespaces/RunEvent#runcompleted)

#### Returns

`Artifact`

***

<a id="fromruntime"></a>

### fromRuntime

> `const` **fromRuntime**: \{(`runtime`, `taskId`): `Effect`\<`Task`, [`TaskProjectionFailed`](./Errors#taskprojectionfailed)\>; (`taskId`): (`runtime`) => `Effect`\<`Task`, [`TaskProjectionFailed`](./Errors#taskprojectionfailed)\>; \}

**`Experimental`**

Project one Runtime snapshot and its canonical history to an A2A Task.

#### Call Signature

> (`runtime`, `taskId`): `Effect`\<`Task`, [`TaskProjectionFailed`](./Errors#taskprojectionfailed)\>

##### Parameters

###### runtime

[`Service`](../../runtime/namespaces/Runtime#service)

###### taskId

`string`

##### Returns

`Effect`\<`Task`, [`TaskProjectionFailed`](./Errors#taskprojectionfailed)\>

#### Call Signature

> (`taskId`): (`runtime`) => `Effect`\<`Task`, [`TaskProjectionFailed`](./Errors#taskprojectionfailed)\>

##### Parameters

###### taskId

`string`

##### Returns

(`runtime`) => `Effect`\<`Task`, [`TaskProjectionFailed`](./Errors#taskprojectionfailed)\>

***

<a id="statefromrun"></a>

### stateFromRun

> `const` **stateFromRun**: (`run`) => `TaskState`

**`Experimental`**

Map authoritative Runtime status to A2A task state.

#### Parameters

##### run

[`RunInspection`](../../runtime/namespaces/Run#runinspection)

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

[`RunEvent`](../../runtime/namespaces/RunEvent#runevent)

##### Returns

`TaskStatus` \| `undefined`

#### Call Signature

> (`event`): (`task`) => `TaskStatus` \| `undefined`

##### Parameters

###### event

[`RunEvent`](../../runtime/namespaces/RunEvent#runevent)

##### Returns

(`task`) => `TaskStatus` \| `undefined`
