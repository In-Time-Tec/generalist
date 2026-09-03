[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / TreePolicy

# TreePolicy

## Type Aliases

<a id="treepolicy"></a>

### TreePolicy

> **TreePolicy** = *typeof* `TreePolicy.Type`

Root-pinned bounds for recursive child admission. Root depth is zero.

## Variables

<a id="defaulttreepolicy"></a>

### defaultTreePolicy

> `const` **defaultTreePolicy**: [`TreePolicy`](#treepolicy)

Policy used when a root admission does not specify one: unbounded within the
schema's fixed ceiling. A host that wants recursion limits pins them explicitly; an unspecified
policy must not invent one. `TREE_POLICY_MAX` is the representation because tree policy is
durable — it is stored in integer columns and feeds the root digest, so a non-finite sentinel
would not survive serialization or keep idempotency stable.

***

<a id="normalize"></a>

### normalize

> `const` **normalize**: (`policy?`) => `Effect.Effect`\<[`TreePolicy`](#treepolicy), [`TreePolicyInvalid`](./Errors#treepolicyinvalid)\>

Decode and detach one root policy before its authoritative admission.

#### Parameters

##### policy?

*typeof* `TreePolicy.Encoded`

#### Returns

`Effect.Effect`\<[`TreePolicy`](#treepolicy), [`TreePolicyInvalid`](./Errors#treepolicyinvalid)\>

***

<a id="tree_policy_max"></a>

### TREE\_POLICY\_MAX

> `const` **TREE\_POLICY\_MAX**: `1024` = `1024`

Fixed upper bound for each recursive Run tree policy dimension.

***

<a id="treepolicy-1"></a>

### TreePolicy

> `const` **TreePolicy**: `Schema.Struct`\<\{ `maxDepth`: `Schema.Int`; `maxSubagents`: `Schema.Int`; \}\>

Root-pinned bounds for recursive child admission. Root depth is zero.
