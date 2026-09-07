[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / Approval

# Approval

## Type Aliases

<a id="approvalid"></a>

### ApprovalId

> **ApprovalId** = *typeof* `ApprovalId.Type`

Stable identity for one approval request.

***

<a id="approveinput"></a>

### ApproveInput

> **ApproveInput** = *typeof* `ApproveInput.Type`

Approve exactly one pending authorization request.

***

<a id="decision"></a>

### Decision

> **Decision** = *typeof* `Decision.Type`

One terminal response to an approval request.

***

<a id="denyinput"></a>

### DenyInput

> **DenyInput** = *typeof* `DenyInput.Type`

Deny exactly one pending authorization request.

***

<a id="request"></a>

### Request

> **Request** = *typeof* `Request.Type`

The exact operation and capability awaiting authorization.

***

<a id="respondinput"></a>

### RespondInput

> **RespondInput** = *typeof* `RespondInput.Type`

Respond to exactly one stable approval request.

## Variables

<a id="approvalid-1"></a>

### ApprovalId

> `const` **ApprovalId**: `Schema.String`

Stable identity for one approval request.

***

<a id="approve"></a>

### approve

> `const` **approve**: (`input`) => `Effect.Effect`\<`void`, [`RespondApprovalError`](./Runtime.md#respondapprovalerror), [`Runtime`](./Runtime.md#runtime)\>

Approve through the active Runtime service.

#### Parameters

##### input

[`ApproveInput`](#approveinput)

#### Returns

`Effect.Effect`\<`void`, [`RespondApprovalError`](./Runtime.md#respondapprovalerror), [`Runtime`](./Runtime.md#runtime)\>

***

<a id="approveinput-1"></a>

### ApproveInput

> `const` **ApproveInput**: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `runId`: `Schema.String`; \}\>

Approve exactly one pending authorization request.

***

<a id="decision-1"></a>

### Decision

> `const` **Decision**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\]\>

One terminal response to an approval request.

***

<a id="deny"></a>

### deny

> `const` **deny**: (`input`) => `Effect.Effect`\<`void`, [`RespondApprovalError`](./Runtime.md#respondapprovalerror), [`Runtime`](./Runtime.md#runtime)\>

Deny through the active Runtime service.

#### Parameters

##### input

[`DenyInput`](#denyinput)

#### Returns

`Effect.Effect`\<`void`, [`RespondApprovalError`](./Runtime.md#respondapprovalerror), [`Runtime`](./Runtime.md#runtime)\>

***

<a id="denyinput-1"></a>

### DenyInput

> `const` **DenyInput**: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `runId`: `Schema.String`; \}\>

Deny exactly one pending authorization request.

***

<a id="request-1"></a>

### Request

> `const` **Request**: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `capability`: `Schema.String`; `input`: `Schema.Unknown`; `operation`: `Schema.String`; \}\>

The exact operation and capability awaiting authorization.

***

<a id="resolvewith"></a>

### resolveWith

> `const` **resolveWith**: (`runtime`, `token`, `decision`, `options?`) => `Effect.Effect`\<`void`, [`ResolveError`](../../approvals.md#resolveerror), [`RuleStore`](../../permissions.md#rulestore)\>

**`Internal`**

Resolve one exact durable approval token through the supplied Runtime.

#### Parameters

##### runtime

[`Service`](./Runtime.md#service)

##### token

`string`

##### decision

[`Approved`](../../approvals.md#approved) \| [`Denied`](../../approvals.md#denied)

##### options?

[`ResolveOptions`](../../approvals.md#resolveoptions)

#### Returns

`Effect.Effect`\<`void`, [`ResolveError`](../../approvals.md#resolveerror), [`RuleStore`](../../permissions.md#rulestore)\>

***

<a id="respondinput-1"></a>

### RespondInput

> `const` **RespondInput**: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\]\>; `operator`: `Schema.optionalKey`\<`Schema.String`\>; `runId`: `Schema.String`; \}\>

Respond to exactly one stable approval request.

## References

<a id="approvaltokeninvalid"></a>

### ApprovalTokenInvalid

Re-exports [ApprovalTokenInvalid](../../approvals.md#approvaltokeninvalid)

***

<a id="resolve"></a>

### resolve

Re-exports [resolve](../../approvals.md#resolve-1)

***

<a id="resolveerror"></a>

### ResolveError

Re-exports [ResolveError](../../approvals.md#resolveerror)

***

<a id="resolveoptions"></a>

### ResolveOptions

Re-exports [ResolveOptions](../../approvals.md#resolveoptions)
