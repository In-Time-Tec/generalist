[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / HostSession

# HostSession

## Interfaces

### CreateSessionInput

#### Properties

##### id

> `readonly` **id**: `string`

##### title?

> `readonly` `optional` **title?**: `string`

***

### HostSessionEvent

One Runtime event at its exclusive Session replay cursor.

#### Properties

##### cursor

> `readonly` **cursor**: `number`

##### event

> `readonly` **event**: [`RunEvent`](./RunEvent#runevent)

***

### RuntimeHostSessions

Runtime operations that persist and observe product-facing Sessions.

#### Extended by

- [`Service`](./Runtime#service)

#### Properties

##### createSession

> `readonly` **createSession**: (`input`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`CreateSessionError`](#createsessionerror)\>

###### Parameters

###### input

[`CreateSessionInput`](#createsessioninput)

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`CreateSessionError`](#createsessionerror)\>

##### listSessions

> `readonly` **listSessions**: `Effect`\<readonly `object`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

##### session

> `readonly` **session**: (`sessionId`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionError`](#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionError`](#sessionerror)\>

##### sessionEvents

> `readonly` **sessionEvents**: (`input`) => `Stream`\<[`HostSessionEvent`](#hostsessionevent), [`SessionEventsError`](#sessioneventserror)\>

###### Parameters

###### input

[`SessionEventsInput`](#sessioneventsinput)

###### Returns

`Stream`\<[`HostSessionEvent`](#hostsessionevent), [`SessionEventsError`](#sessioneventserror)\>

##### sessionRuns

> `readonly` **sessionRuns**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`SessionError`](#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`SessionError`](#sessionerror)\>

***

### SessionEventsInput

#### Properties

##### cursor?

> `readonly` `optional` **cursor?**: `number`

##### sessionId

> `readonly` **sessionId**: `string`

## Type Aliases

### CreateSessionError

> **CreateSessionError** = [`SessionConflict`](../../host#sessionconflict) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### SessionError

> **SessionError** = [`SessionNotFound`](../../host#sessionnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

***

### SessionEventsError

> **SessionEventsError** = [`SessionNotFound`](../../host#sessionnotfound) \| [`SessionCursorExpired`](../../host#sessioncursorexpired) \| [`SessionSubscriberLagged`](../../host#sessionsubscriberlagged) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

## References

### HostSession

Re-exports [HostSession](../../host#hostsession)

***

### SessionConflict

Re-exports [SessionConflict](../../host#sessionconflict)

***

### SessionCursorExpired

Re-exports [SessionCursorExpired](../../host#sessioncursorexpired)

***

### SessionNotFound

Re-exports [SessionNotFound](../../host#sessionnotfound)

***

### SessionSubscriberLagged

Re-exports [SessionSubscriberLagged](../../host#sessionsubscriberlagged)
