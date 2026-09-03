[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Cursor

# Cursor

## Type Aliases

### Cursor

> **Cursor** = *typeof* `Cursor.Type`

## Variables

### Cursor

> `const` **Cursor**: `Schema.Int`

***

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

### make

> `const` **make**: (`value`) => [`Cursor`](#cursor)

#### Parameters

##### value

`number`

#### Returns

[`Cursor`](#cursor)

***

### origin

> `const` **origin**: [`Cursor`](#cursor)
