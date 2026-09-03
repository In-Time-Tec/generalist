[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / HostSession

# HostSession

## Interfaces

<a id="createsessioninput"></a>

### CreateSessionInput

#### Properties

<a id="id"></a>

##### id

> `readonly` **id**: `string`

<a id="title"></a>

##### title?

> `readonly` `optional` **title?**: `string`

***

<a id="hostsessionevent"></a>

### HostSessionEvent

One Runtime event at its exclusive Session replay cursor.

#### Properties

<a id="cursor"></a>

##### cursor

> `readonly` **cursor**: `number`

<a id="event"></a>

##### event

> `readonly` **event**: [`RunEvent`](./RunEvent#runevent)

***

<a id="runtimehostsessions"></a>

### RuntimeHostSessions

Runtime operations that persist and observe product-facing Sessions.

#### Extended by

- [`Service`](./Runtime#service)

#### Properties

<a id="createsession"></a>

##### createSession

> `readonly` **createSession**: (`input`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`CreateSessionError`](#createsessionerror)\>

###### Parameters

###### input

[`CreateSessionInput`](#createsessioninput)

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`CreateSessionError`](#createsessionerror)\>

<a id="listsessions"></a>

##### listSessions

> `readonly` **listSessions**: `Effect`\<readonly `object`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="session"></a>

##### session

> `readonly` **session**: (`sessionId`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionError`](#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionError`](#sessionerror)\>

<a id="sessionevents"></a>

##### sessionEvents

> `readonly` **sessionEvents**: (`input`) => `Stream`\<[`HostSessionEvent`](#hostsessionevent), [`SessionEventsError`](#sessioneventserror)\>

###### Parameters

###### input

[`SessionEventsInput`](#sessioneventsinput)

###### Returns

`Stream`\<[`HostSessionEvent`](#hostsessionevent), [`SessionEventsError`](#sessioneventserror)\>

<a id="sessionruns"></a>

##### sessionRuns

> `readonly` **sessionRuns**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`SessionError`](#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`SessionError`](#sessionerror)\>

***

<a id="sessioneventsinput"></a>

### SessionEventsInput

#### Properties

<a id="cursor-1"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `number`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

## Type Aliases

<a id="createsessionerror"></a>

### CreateSessionError

> **CreateSessionError** = [`SessionConflict`](../../host#sessionconflict) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="sessionerror"></a>

### SessionError

> **SessionError** = [`SessionNotFound`](../../host#sessionnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

<a id="sessioneventserror"></a>

### SessionEventsError

> **SessionEventsError** = [`SessionNotFound`](../../host#sessionnotfound) \| [`SessionCursorExpired`](../../host#sessioncursorexpired) \| [`SessionSubscriberLagged`](../../host#sessionsubscriberlagged) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

## References

<a id="hostsession"></a>

### HostSession

Re-exports [HostSession](../../host#hostsession)

***

<a id="sessionconflict"></a>

### SessionConflict

Re-exports [SessionConflict](../../host#sessionconflict)

***

<a id="sessioncursorexpired"></a>

### SessionCursorExpired

Re-exports [SessionCursorExpired](../../host#sessioncursorexpired)

***

<a id="sessionnotfound"></a>

### SessionNotFound

Re-exports [SessionNotFound](../../host#sessionnotfound)

***

<a id="sessionsubscriberlagged"></a>

### SessionSubscriberLagged

Re-exports [SessionSubscriberLagged](../../host#sessionsubscriberlagged)
