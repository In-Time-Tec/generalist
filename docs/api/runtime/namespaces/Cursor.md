[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Cursor

# Cursor

## Type Aliases

<a id="cursor"></a>

### Cursor

> **Cursor** = *typeof* `Cursor.Type`

## Variables

<a id="cursor-1"></a>

### Cursor

> `const` **Cursor**: `Schema.Int`

***

<a id="decode"></a>

### decode

> `const` **decode**: \{(`input`, `options?`): `Effect`\<`number`, `SchemaError`\>; (`options?`): (`input`) => `Effect`\<`number`, `SchemaError`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<`number`, `SchemaError`\>

##### Parameters

###### input

`number`

###### options?

`ParseOptions`

##### Returns

`Effect`\<`number`, `SchemaError`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`number`, `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`number`, `SchemaError`\>

***

<a id="encode"></a>

### encode

> `const` **encode**: \{(`input`, `options?`): `Effect`\<`number`, `SchemaError`\>; (`options?`): (`input`) => `Effect`\<`number`, `SchemaError`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<`number`, `SchemaError`\>

##### Parameters

###### input

`number`

###### options?

`ParseOptions`

##### Returns

`Effect`\<`number`, `SchemaError`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`number`, `SchemaError`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`number`, `SchemaError`\>

***

<a id="make"></a>

### make

> `const` **make**: (`value`) => [`Cursor`](#cursor)

#### Parameters

##### value

`number`

#### Returns

[`Cursor`](#cursor)

***

<a id="origin"></a>

### origin

> `const` **origin**: [`Cursor`](#cursor)
