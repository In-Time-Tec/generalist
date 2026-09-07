[**generalist**](./index.md)

***

[generalist](./index.md) / durability.discovery

# durability.discovery

## Type Aliases

<a id="location"></a>

### Location

> **Location** = *typeof* `Identity.Type`

**`Experimental`**

An immutable partition location; inspect its journal before activation.

***

<a id="scope"></a>

### Scope

> **Scope** = *typeof* `MarkerScope.Type`

**`Experimental`**

Authorized tenant scope for read-only partition discovery.

## Variables

<a id="inspect"></a>

### inspect

> `const` **inspect**: (`location`) => `Effect.Effect`\<\{ `head?`: `never`; `location`: \{ `environment`: `string`; `partition`: `string`; `tenant`: `string`; \}; `status`: `"uncommitted"`; \} \| \{ `head`: `Head`; `location`: \{ `environment`: `string`; `partition`: `string`; `tenant`: `string`; \}; `status`: `"committed"`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure), `Crypto` \| `ObjectStore`\>

**`Experimental`**

Reconstruct a located journal within fixed validation budgets without activating it.

#### Parameters

##### location

[`Location`](#location)

#### Returns

`Effect.Effect`\<\{ `head?`: `never`; `location`: \{ `environment`: `string`; `partition`: `string`; `tenant`: `string`; \}; `status`: `"uncommitted"`; \} \| \{ `head`: `Head`; `location`: \{ `environment`: `string`; `partition`: `string`; `tenant`: `string`; \}; `status`: `"committed"`; \}, [`DurabilityFailure`](./durability.md#durabilityfailure), `Crypto` \| `ObjectStore`\>

***

<a id="page"></a>

### page

> `const` **page**: (`input`) => `Effect.Effect`\<\{ `cursor?`: `never`; `locations`: `object`[]; \} \| \{ `cursor`: `string`; `locations`: `object`[]; \}, [`DurabilityFailure`](./durability.md#durabilityfailure), `ObjectStore`\>

**`Experimental`**

Read one bounded page of retained locations without notifications or writes.

#### Parameters

##### input

[`Scope`](#scope) & `object`

#### Returns

`Effect.Effect`\<\{ `cursor?`: `never`; `locations`: `object`[]; \} \| \{ `cursor`: `string`; `locations`: `object`[]; \}, [`DurabilityFailure`](./durability.md#durabilityfailure), `ObjectStore`\>
