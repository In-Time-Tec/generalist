[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Approval

# Approval

## Type Aliases

### ApprovalId

> **ApprovalId** = *typeof* `ApprovalId.Type`

Stable identity for one approval request.

***

### ApproveInput

> **ApproveInput** = *typeof* `ApproveInput.Type`

Approve exactly one pending authorization request.

***

### Decision

> **Decision** = *typeof* `Decision.Type`

One terminal response to an approval request.

***

### DenyInput

> **DenyInput** = *typeof* `DenyInput.Type`

Deny exactly one pending authorization request.

***

### Request

> **Request** = *typeof* `Request.Type`

The exact operation and capability awaiting authorization.

***

### RespondInput

> **RespondInput** = *typeof* `RespondInput.Type`

Respond to exactly one stable approval request.

## Variables

### ApprovalId

> `const` **ApprovalId**: `Schema.String`

Stable identity for one approval request.

***

### approve

> `const` **approve**: (`input`) => `Effect.Effect`\<`void`, [`RespondApprovalError`](./Runtime#respondapprovalerror), [`Runtime`](./Runtime#runtime)\>

Approve through the active Runtime service.

#### Parameters

##### input

[`ApproveInput`](#approveinput)

#### Returns

`Effect.Effect`\<`void`, [`RespondApprovalError`](./Runtime#respondapprovalerror), [`Runtime`](./Runtime#runtime)\>

***

### ApproveInput

> `const` **ApproveInput**: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `runId`: `Schema.String`; \}\>

Approve exactly one pending authorization request.

***

### Decision

> `const` **Decision**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\]\>

One terminal response to an approval request.

***

### deny

> `const` **deny**: (`input`) => `Effect.Effect`\<`void`, [`RespondApprovalError`](./Runtime#respondapprovalerror), [`Runtime`](./Runtime#runtime)\>

Deny through the active Runtime service.

#### Parameters

##### input

[`DenyInput`](#denyinput)

#### Returns

`Effect.Effect`\<`void`, [`RespondApprovalError`](./Runtime#respondapprovalerror), [`Runtime`](./Runtime#runtime)\>

***

### DenyInput

> `const` **DenyInput**: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `runId`: `Schema.String`; \}\>

Deny exactly one pending authorization request.

***

### Request

> `const` **Request**: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `capability`: `Schema.String`; `input`: `Schema.Unknown`; `operation`: `Schema.String`; \}\>

The exact operation and capability awaiting authorization.

***

### resolveWith

> `const` **resolveWith**: (`runtime`, `token`, `decision`, `options?`) => `Effect.Effect`\<`void`, [`ResolveError`](../../approvals#resolveerror), [`RuleStore`](../../permissions#rulestore)\>

**`Internal`**

Resolve one exact durable approval token through the supplied Runtime.

#### Parameters

##### runtime

[`Service`](./Runtime#service)

##### token

`string`

##### decision

[`Approved`](../../approvals#approved) \| [`Denied`](../../approvals#denied)

##### options?

[`ResolveOptions`](../../approvals#resolveoptions)

#### Returns

`Effect.Effect`\<`void`, [`ResolveError`](../../approvals#resolveerror), [`RuleStore`](../../permissions#rulestore)\>

***

### RespondInput

> `const` **RespondInput**: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\]\>; `operator`: `Schema.optionalKey`\<`Schema.String`\>; `runId`: `Schema.String`; \}\>

Respond to exactly one stable approval request.

## References

### ApprovalTokenInvalid

Re-exports [ApprovalTokenInvalid](../../approvals#approvaltokeninvalid)

***

### resolve

Re-exports [resolve](../../approvals#resolve-1)

***

### ResolveError

Re-exports [ResolveError](../../approvals#resolveerror)

***

### ResolveOptions

Re-exports [ResolveOptions](../../approvals#resolveoptions)
