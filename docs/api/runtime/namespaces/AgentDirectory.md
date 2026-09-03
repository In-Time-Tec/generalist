[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / AgentDirectory

# AgentDirectory

## Classes

<a id="addressinvalid"></a>

### AddressInvalid

#### Extends

- `AddressInvalid_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new AddressInvalid**(...`args`): [`AddressInvalid`](#addressinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AddressInvalid`](#addressinvalid)

###### Inherited from

`AddressInvalid_base.constructor`

#### Properties

<a id="address"></a>

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

###### Inherited from

`AddressInvalid_base.address`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AddressInvalid_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`AddressInvalid_base.message`

## Interfaces

<a id="directoryentry"></a>

### DirectoryEntry

One resolved, authoritative directory record.

#### Properties

<a id="address-1"></a>

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

<a id="name"></a>

##### name?

> `readonly` `optional` **name?**: `string` & `Brand`\<`"generalist/runtime/AgentName"`\>

<a id="parentrunid"></a>

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

<a id="rootrunid"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

<a id="status"></a>

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

## Type Aliases

<a id="addresstarget"></a>

### AddressTarget

> **AddressTarget** = \{ `_tag`: `"Run"`; `runId`: `string`; \} \| \{ `_tag`: `"Session"`; `sessionId`: `string`; \} \| \{ `_tag`: `"Name"`; `name`: `string`; `scope`: `string`; \}

What an Address names before authoritative resolution.

***

<a id="agentname"></a>

### AgentName

> **AgentName** = *typeof* `AgentName.Type`

Host-assigned friendly name for one addressable agent.

***

<a id="relationship"></a>

### Relationship

> **Relationship** = *typeof* `Relationship.Type`

Relationship Generalist derives from authoritative Run records, never from Address text.

## Variables

<a id="agentname-1"></a>

### AgentName

> `const` **AgentName**: `Schema.brand`\<`Schema.String`, `"generalist/runtime/AgentName"`\>

Host-assigned friendly name for one addressable agent.

***

<a id="directoryentry-1"></a>

### DirectoryEntry

> **DirectoryEntry**: `Codec`\<[`DirectoryEntry`](#directoryentry), `DirectoryEntryEncoded`, `never`, `never`\>

***

<a id="makename"></a>

### makeName

> `const` **makeName**: (`value`) => [`AgentName`](#agentname)

#### Parameters

##### value

`string`

#### Returns

[`AgentName`](#agentname)

***

<a id="nameaddress"></a>

### nameAddress

> `const` **nameAddress**: (`input`) => [`Address`](./Address#address)

Address of one host-assigned name inside the scope that owns it.

#### Parameters

##### input

###### name

[`AgentName`](#agentname)

###### scope

`string`

#### Returns

[`Address`](./Address#address)

***

<a id="namescope"></a>

### nameScope

> `const` **nameScope**: (`input`) => `string`

Naming scope for one Run: its parent Run, or its own root when it has no parent.

#### Parameters

##### input

###### parentRunId?

`string`

###### runId

`string`

#### Returns

`string`

***

<a id="parseaddress"></a>

### parseAddress

> `const` **parseAddress**: (`address`) => `Effect.Effect`\<[`AddressTarget`](#addresstarget), [`AddressInvalid`](#addressinvalid)\>

Read the shape of an Address.

This states which directory table to look in. It never establishes identity, parentage, session
membership, or authority: every one of those facts is read from the durable Run record the
directory resolves to.

#### Parameters

##### address

[`Address`](./Address#address)

#### Returns

`Effect.Effect`\<[`AddressTarget`](#addresstarget), [`AddressInvalid`](#addressinvalid)\>

***

<a id="relationship-1"></a>

### relationship

> `const` **relationship**: \{(`target`): (`sender`) => `"parent"` \| `"child"` \| `"self"` \| `"sibling"` \| `undefined`; (`sender`, `target`): `"parent"` \| `"child"` \| `"self"` \| `"sibling"` \| `undefined`; \}

Classify one sender against one target using only durable parentage.

Returns undefined when no built-in relationship holds. Whether an unrelated pair may address each
other is a host policy decision, not a derived fact.

#### Call Signature

> (`target`): (`sender`) => `"parent"` \| `"child"` \| `"self"` \| `"sibling"` \| `undefined`

##### Parameters

###### target

[`DirectoryEntry`](#directoryentry)

##### Returns

(`sender`) => `"parent"` \| `"child"` \| `"self"` \| `"sibling"` \| `undefined`

#### Call Signature

> (`sender`, `target`): `"parent"` \| `"child"` \| `"self"` \| `"sibling"` \| `undefined`

##### Parameters

###### sender

[`DirectoryEntry`](#directoryentry)

###### target

[`DirectoryEntry`](#directoryentry)

##### Returns

`"parent"` \| `"child"` \| `"self"` \| `"sibling"` \| `undefined`

***

<a id="relationship-2"></a>

### Relationship

> `const` **Relationship**: `Schema.Literals`\<readonly \[`"self"`, `"parent"`, `"child"`, `"sibling"`\]\>

Relationship Generalist derives from authoritative Run records, never from Address text.

***

<a id="runaddress"></a>

### runAddress

> `const` **runAddress**: (`runId`) => [`Address`](./Address#address)

Address of one exact durable execution.

#### Parameters

##### runId

`string`

#### Returns

[`Address`](./Address#address)

***

<a id="sessionaddress"></a>

### sessionAddress

> `const` **sessionAddress**: (`sessionId`) => [`Address`](./Address#address)

Address of one durable agent identity across its successive Runs.

#### Parameters

##### sessionId

`string`

#### Returns

[`Address`](./Address#address)
