[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ExecutableRegistration

# ExecutableRegistration

## Type Aliases

<a id="compactionpolicy"></a>

### CompactionPolicy

> **CompactionPolicy** = *typeof* `CompactionPolicy.Type`

Bounded secret-free policy used to reconstruct a pinned compaction service.

***

<a id="executableregistration"></a>

### ExecutableRegistration

> **ExecutableRegistration** = *typeof* `ExecutableRegistration.Type`

Secret-free application data used to reconstruct one opaque model or capability pin.

## Variables

<a id="compactionpolicy-1"></a>

### CompactionPolicy

> `const` **CompactionPolicy**: `Schema.Struct`\<\{ `keepRecentTokens`: `Schema.Int`; `strategyIdentity`: `Schema.String`; `summaryPromptIdentity`: `Schema.String`; \}\>

Bounded secret-free policy used to reconstruct a pinned compaction service.

***

<a id="digest"></a>

### digest

> `const` **digest**: (`registration`) => `string`

Stable persisted identity of one registration.

#### Parameters

##### registration

[`ExecutableRegistration`](#executableregistration)

#### Returns

`string`

***

<a id="encodejson"></a>

### encodeJson

> `const` **encodeJson**: *typeof* `encoded`

***

<a id="executableregistration-1"></a>

### ExecutableRegistration

> `const` **ExecutableRegistration**: `Schema.Struct`\<\{ `codec`: `Schema.String`; `payload`: `Schema.Unknown`; `pin`: `Schema.String`; `version`: `Schema.String`; \}\>

Secret-free application data used to reconstruct one opaque model or capability pin.

***

<a id="narrow"></a>

### narrow

> `const` **narrow**: \{(`registrations`): (`executable`) => `Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>; (`executable`, `registrations`): `Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>; \}

Select and validate the exact registrations required by a narrowed executable.

#### Call Signature

> (`registrations`): (`executable`) => `Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>

##### Parameters

###### registrations

readonly `object`[]

##### Returns

(`executable`) => `Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>

#### Call Signature

> (`executable`, `registrations`): `Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>

##### Parameters

###### executable

[`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

###### registrations

readonly `object`[]

##### Returns

`Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>

***

<a id="requiredpins"></a>

### requiredPins

> `const` **requiredPins**: (`executable`) => `ReadonlySet`\<`string`\>

#### Parameters

##### executable

[`PinnedExecutable`](./ExecutableManifest#pinnedexecutable)

#### Returns

`ReadonlySet`\<`string`\>

***

<a id="requiredpinsforactiveexecutable"></a>

### requiredPinsForActiveExecutable

> `const` **requiredPinsForActiveExecutable**: (`executable`) => `ReadonlySet`\<`string`\>

Exact pins one active executable requires, independent of the rest of its closure.

#### Parameters

##### executable

[`PinnedExecutable`](./ExecutableManifest#pinnedexecutable)

#### Returns

`ReadonlySet`\<`string`\>

***

<a id="validate"></a>

### validate

> `const` **validate**: \{(`registrations`, `required?`): (`executable`) => `Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>; (`executable`, `registrations`, `required?`): `Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>; \}

Validate and canonicalize the complete registration set for one exact executable.

#### Call Signature

> (`registrations`, `required?`): (`executable`) => `Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>

##### Parameters

###### registrations

readonly `object`[]

###### required?

`ReadonlySet`\<`string`\>

##### Returns

(`executable`) => `Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>

#### Call Signature

> (`executable`, `registrations`, `required?`): `Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>

##### Parameters

###### executable

[`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

###### registrations

readonly `object`[]

###### required?

`ReadonlySet`\<`string`\>

##### Returns

`Effect`\<readonly `object`[], [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)\>
