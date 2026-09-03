[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Address

# Address

## Type Aliases

### Address

> **Address** = *typeof* `Address.Type`

## Variables

### Address

> `const` **Address**: `Schema.brand`\<`Schema.String`, `"Address"`\>

***

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

### make

> `const` **make**: (`value`) => [`Address`](#address)

#### Parameters

##### value

`string`

#### Returns

[`Address`](#address)
