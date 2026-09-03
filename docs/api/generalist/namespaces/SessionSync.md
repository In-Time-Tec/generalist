[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / SessionSync

# SessionSync

## Type Aliases

<a id="diagnostics"></a>

### Diagnostics

> **Diagnostics** = *typeof* `Diagnostics.Type`

Bounded structural evidence for a Session/Chat divergence. Carries counts, roles, part types, and digests only — never raw prompt, message, or tool payload text.

***

<a id="divergence"></a>

### Divergence

> **Divergence** = *typeof* `Divergence.Type`

First structurally divergent position between the Session projection and live Chat history.

## Variables

<a id="coalesceadjacenttext"></a>

### coalesceAdjacentText

> `const` **coalesceAdjacentText**: (`message`) => `Prompt.Message`

Merge consecutive text parts that share options within each message.

The provider-agnostic Chat export encodes a user message whose content is a
multi-text-part array by keeping only the first text part, silently dropping the
rest. Coalescing adjacent text parts into one before that encoding is lossless —
providers already concatenate adjacent text — and keeps the live Chat history
a faithful prefix of the durable session projection. It also canonicalizes a
message for structural comparison so a representation-only difference between the
live Chat projection and the authoritative Session history never reads as divergence.

#### Parameters

##### message

`Prompt.Message`

#### Returns

`Prompt.Message`

***

<a id="diagnose"></a>

### diagnose

> `const` **diagnose**: (`input`) => [`Diagnostics`](#diagnostics)

Computes bounded divergence diagnostics for a failed Session synchronization.

#### Parameters

##### input

###### durableEntryTags

`ReadonlyArray`\<`string`\>

###### projection

`ReadonlyArray`\<`Prompt.Message`\>

###### sessionId

`string`

###### transcript

`ReadonlyArray`\<`Prompt.Message`\>

#### Returns

[`Diagnostics`](#diagnostics)

***

<a id="diagnostics-1"></a>

### Diagnostics

> `const` **Diagnostics**: `Schema.Struct`\<\{ `alignmentCount`: `Schema.Finite`; `authoritativeMessageCount`: `Schema.Finite`; `commonPrefixLength`: `Schema.Finite`; `durableEntryCount`: `Schema.Finite`; `durableMessageCount`: `Schema.Finite`; `firstDivergence`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `authoritativeDigest`: `Schema.optionalKey`\<`Schema.String`\>; `authoritativePartTypes`: `Schema.$Array`\<`Schema.String`\>; `authoritativeRole`: `Schema.optionalKey`\<`Schema.String`\>; `durableDigest`: `Schema.optionalKey`\<`Schema.String`\>; `durablePartTypes`: `Schema.$Array`\<`Schema.String`\>; `durableRole`: `Schema.optionalKey`\<`Schema.String`\>; `index`: `Schema.Finite`; \}\>\>; `lastDurableEntryTag`: `Schema.optionalKey`\<`Schema.String`\>; `sessionId`: `Schema.String`; \}\>

Bounded structural evidence for a Session/Chat divergence. Carries counts, roles, part types, and digests only — never raw prompt, message, or tool payload text.

***

<a id="divergence-1"></a>

### Divergence

> `const` **Divergence**: `Schema.Struct`\<\{ `authoritativeDigest`: `Schema.optionalKey`\<`Schema.String`\>; `authoritativePartTypes`: `Schema.$Array`\<`Schema.String`\>; `authoritativeRole`: `Schema.optionalKey`\<`Schema.String`\>; `durableDigest`: `Schema.optionalKey`\<`Schema.String`\>; `durablePartTypes`: `Schema.$Array`\<`Schema.String`\>; `durableRole`: `Schema.optionalKey`\<`Schema.String`\>; `index`: `Schema.Finite`; \}\>

First structurally divergent position between the Session projection and live Chat history.

***

<a id="equivalentmessages"></a>

### equivalentMessages

> `const` **equivalentMessages**: \{(`right`): (`left`) => `boolean`; (`left`, `right`): `boolean`; \}

Compares prompt messages by canonical content across equivalent runtime representations.

#### Call Signature

> (`right`): (`left`) => `boolean`

##### Parameters

###### right

`Message`

##### Returns

(`left`) => `boolean`

#### Call Signature

> (`left`, `right`): `boolean`

##### Parameters

###### left

`Message`

###### right

`Message`

##### Returns

`boolean`
