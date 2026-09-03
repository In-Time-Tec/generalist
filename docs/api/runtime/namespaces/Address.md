[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Address

# Address

## Type Aliases

<a id="address"></a>

### Address

> **Address** = *typeof* `Address.Type`

## Variables

<a id="address-1"></a>

### Address

> `const` **Address**: `Schema.brand`\<`Schema.String`, `"Address"`\>

***

<a id="decode"></a>

### decode

> `const` **decode**: \{(`input`, `options?`): `Effect`\<`string` & `Brand`\<`"Address"`\>, `SchemaError`\>; (`options?`): (`input`) => `Effect`\<`string` & `Brand`\<`"Address"`\>, `SchemaError`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<`string` & `Brand`\<`"Address"`\>, `SchemaError`\>

##### Parameters

###### input

`string`

###### options?

`ParseOptions`

##### Returns

`Effect`\<`string` & `Brand`\<`"Address"`\>, `SchemaError`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`string` & `Brand`\<`"Address"`\>, `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`string` & `Brand`\<`"Address"`\>, `SchemaError`\>

***

<a id="encode"></a>

### encode

> `const` **encode**: \{(`input`, `options?`): `Effect`\<`string`, `SchemaError`\>; (`options?`): (`input`) => `Effect`\<`string`, `SchemaError`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<`string`, `SchemaError`\>

##### Parameters

###### input

`string` & `Brand`\<`"Address"`\>

###### options?

`ParseOptions`

##### Returns

`Effect`\<`string`, `SchemaError`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`string`, `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`string`, `SchemaError`\>

***

<a id="make"></a>

### make

> `const` **make**: (`value`) => [`Address`](#address)

#### Parameters

##### value

`string`

#### Returns

[`Address`](#address)
