[**generalist**](./index)

***

[generalist](./index) / permissions

# permissions

## Classes

### InvalidRuleFile

A permission rule file failed JSON/YAML parsing or Rule schema validation.

#### Extends

- `InvalidRuleFile_base`

#### Constructors

##### Constructor

> **new InvalidRuleFile**(...`args`): [`InvalidRuleFile`](#invalidrulefile)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`InvalidRuleFile`](#invalidrulefile)

###### Inherited from

`InvalidRuleFile_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`InvalidRuleFile_base.hint`

##### issues

> `readonly` **issues**: `string`

###### Inherited from

`InvalidRuleFile_base.issues`

##### path

> `readonly` **path**: `string`

###### Inherited from

`InvalidRuleFile_base.path`

***

### PermissionError

Permission service failure.

#### Extends

- `PermissionError_base`

#### Constructors

##### Constructor

> **new PermissionError**(...`args`): [`PermissionError`](#permissionerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`PermissionError`](#permissionerror)

###### Inherited from

`PermissionError_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PermissionError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`PermissionError_base.message`

***

### Permissions

#### Extends

- `Permissions_base`

#### Constructors

##### Constructor

> **new Permissions**(`_`): [`Permissions`](#permissions)

###### Parameters

###### \_

`never`

###### Returns

[`Permissions`](#permissions)

###### Inherited from

`Permissions_base.constructor`

***

### RuleStore

Remembered permission-rule persistence boundary.

#### Extends

- `RuleStore_base`

#### Constructors

##### Constructor

> **new RuleStore**(`_`): [`RuleStore`](#rulestore)

###### Parameters

###### \_

`never`

###### Returns

[`RuleStore`](#rulestore)

###### Inherited from

`RuleStore_base.constructor`

## Interfaces

### Allow

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Allow"`

##### reason?

> `readonly` `optional` **reason?**: `string`

***

### Ask

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Ask"`

##### reason?

> `readonly` `optional` **reason?**: `string`

##### token

> `readonly` **token**: `string`

***

### Deny

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Deny"`

##### reason?

> `readonly` `optional` **reason?**: `string`

***

### Rule

One ordered permission rule.

#### Properties

##### level

> `readonly` **level**: [`Level`](#level-1)

##### pattern

> `readonly` **pattern**: `string`

##### reason?

> `readonly` `optional` **reason?**: `string`

***

### Ruleset

Ordered permission ruleset.

#### Properties

##### fallback?

> `readonly` `optional` **fallback?**: [`Level`](#level-1)

##### rules

> `readonly` **rules**: readonly [`Rule`](#rule)[]

***

### RuleStoreFileOptions

One JSON or YAML permission-rule file.

#### Properties

##### path

> `readonly` **path**: `string`

***

### RuleStoreSqlOptions

SQL permission-rule scope. Rules are stored and read per scope; pass a session id for
per-session rules. Defaults to `"global"`.

#### Properties

##### scope?

> `readonly` `optional` **scope?**: `string`

***

### Service

Permission policy service boundary.

#### Properties

##### evaluate

> `readonly` **evaluate**: (`request`) => `Effect`\<[`Decision`](#decision), [`PermissionError`](#permissionerror)\>

###### Parameters

###### request

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest)

###### Returns

`Effect`\<[`Decision`](#decision), [`PermissionError`](#permissionerror)\>

## Type Aliases

### Decision

> **Decision** = [`Allow`](#allow) \| [`Deny`](#deny) \| [`Ask`](#ask)

Resolved policy decision for one tool call.

***

### Level

> **Level** = `"allow"` \| `"deny"` \| `"ask"`

What a matched permission rule grants.

***

### RuleStoreError

> **RuleStoreError** = [`PermissionError`](#permissionerror) \| [`InvalidRuleFile`](#invalidrulefile)

Permission rule persistence failure.

## Variables

### evaluate

> `const` **evaluate**: \{(`tool`, `params`): (`ruleset`) => [`Level`](#level-1); (`ruleset`, `tool`, `params`): [`Level`](#level-1); \}

Evaluate a ruleset with last-match semantics.

#### Call Signature

> (`tool`, `params`): (`ruleset`) => [`Level`](#level-1)

##### Parameters

###### tool

`string`

###### params

`unknown`

##### Returns

(`ruleset`) => [`Level`](#level-1)

#### Call Signature

> (`ruleset`, `tool`, `params`): [`Level`](#level-1)

##### Parameters

###### ruleset

[`Ruleset`](#ruleset)

###### tool

`string`

###### params

`unknown`

##### Returns

[`Level`](#level-1)

***

### evaluateWithRules

> `const` **evaluateWithRules**: \{(`store`, `request`): (`base`) => `Effect`\<[`Decision`](#decision), [`RuleStoreError`](#rulestoreerror)\>; (`base`, `store`, `request`): `Effect`\<[`Decision`](#decision), [`RuleStoreError`](#rulestoreerror)\>; \}

Evaluate a base policy with remembered rules as a last-match overlay.

#### Call Signature

> (`store`, `request`): (`base`) => `Effect`\<[`Decision`](#decision), [`RuleStoreError`](#rulestoreerror)\>

##### Parameters

###### store

###### remember

(`rule`) => `Effect.Effect`\<`void`, [`RuleStoreError`](#rulestoreerror)\>

###### rules

`Effect.Effect`\<`ReadonlyArray`\<[`Rule`](#rule)\>, [`RuleStoreError`](#rulestoreerror)\>

###### request

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest)

##### Returns

(`base`) => `Effect`\<[`Decision`](#decision), [`RuleStoreError`](#rulestoreerror)\>

#### Call Signature

> (`base`, `store`, `request`): `Effect`\<[`Decision`](#decision), [`RuleStoreError`](#rulestoreerror)\>

##### Parameters

###### base

[`Service`](#service)

###### store

###### remember

(`rule`) => `Effect.Effect`\<`void`, [`RuleStoreError`](#rulestoreerror)\>

###### rules

`Effect.Effect`\<`ReadonlyArray`\<[`Rule`](#rule)\>, [`RuleStoreError`](#rulestoreerror)\>

###### request

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest)

##### Returns

`Effect`\<[`Decision`](#decision), [`RuleStoreError`](#rulestoreerror)\>

***

### layerAllowAll

> `const` **layerAllowAll**: `Layer.Layer`\<[`Permissions`](#permissions)\>

Permission policy that allows every call.

***

### layerFailClosed

> `const` **layerFailClosed**: (`rules?`) => `Layer.Layer`\<[`Permissions`](#permissions)\>

Permission policy that asks before every unmatched call.

#### Parameters

##### rules?

`ReadonlyArray`\<[`Rule`](#rule)\>

#### Returns

`Layer.Layer`\<[`Permissions`](#permissions)\>

***

### layerRuleset

> `const` **layerRuleset**: (`ruleset`) => `Layer.Layer`\<[`Permissions`](#permissions)\>

Policy from a static ruleset.

#### Parameters

##### ruleset

[`Ruleset`](#ruleset)

#### Returns

`Layer.Layer`\<[`Permissions`](#permissions)\>

***

### layerRuleStoreFile

> `const` **layerRuleStoreFile**: (`options`) => `Layer.Layer`\<[`RuleStore`](#rulestore), [`InvalidRuleFile`](#invalidrulefile) \| [`PermissionError`](#permissionerror), `FileSystem.FileSystem` \| `Path.Path`\>

A watched, atomically written JSON or YAML RuleStore.

#### Parameters

##### options

[`RuleStoreFileOptions`](#rulestorefileoptions)

#### Returns

`Layer.Layer`\<[`RuleStore`](#rulestore), [`InvalidRuleFile`](#invalidrulefile) \| [`PermissionError`](#permissionerror), `FileSystem.FileSystem` \| `Path.Path`\>

***

### layerRuleStoreMemory

> `const` **layerRuleStoreMemory**: (`initialRules?`) => `Layer.Layer`\<[`RuleStore`](#rulestore)\>

Non-durable in-memory remembered-rule store.

#### Parameters

##### initialRules?

`ReadonlyArray`\<[`Rule`](#rule)\>

#### Returns

`Layer.Layer`\<[`RuleStore`](#rulestore)\>

***

### layerRuleStoreSql

> `const` **layerRuleStoreSql**: (`options?`) => `Layer.Layer`\<[`RuleStore`](#rulestore), [`PermissionError`](#permissionerror), `SqlClient.SqlClient`\>

A RuleStore in the Runtime `SqlClient`. The `generalist_permission_rules` table is part of
the Runtime SQL schema, so the schema must be migrated before this Layer is used.

#### Parameters

##### options?

[`RuleStoreSqlOptions`](#rulestoresqloptions)

#### Returns

`Layer.Layer`\<[`RuleStore`](#rulestore), [`PermissionError`](#permissionerror), `SqlClient.SqlClient`\>

***

### layerRuleStoreTest

> `const` **layerRuleStoreTest**: (`implementation`) => `Layer.Layer`\<[`RuleStore`](#rulestore)\>

#### Parameters

##### implementation

[`RuleStore`](#rulestore)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`RuleStore`](#rulestore)\>

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Permissions`](#permissions)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Permissions`](#permissions)\>

***

### matches

> `const` **matches**: \{(`tool`, `params`): (`pattern`) => `boolean`; (`pattern`, `tool`, `params`): `boolean`; \}

Match a permission pattern against a tool call.

#### Call Signature

> (`tool`, `params`): (`pattern`) => `boolean`

##### Parameters

###### tool

`string`

###### params

`unknown`

##### Returns

(`pattern`) => `boolean`

#### Call Signature

> (`pattern`, `tool`, `params`): `boolean`

##### Parameters

###### pattern

`string`

###### tool

`string`

###### params

`unknown`

##### Returns

`boolean`

***

### matchRule

> `const` **matchRule**: \{(`tool`, `params`): (`ruleset`) => `Option`\<[`Rule`](#rule)\>; (`ruleset`, `tool`, `params`): `Option`\<[`Rule`](#rule)\>; \}

Find the last matching rule without applying a fallback.

#### Call Signature

> (`tool`, `params`): (`ruleset`) => `Option`\<[`Rule`](#rule)\>

##### Parameters

###### tool

`string`

###### params

`unknown`

##### Returns

(`ruleset`) => `Option`\<[`Rule`](#rule)\>

#### Call Signature

> (`ruleset`, `tool`, `params`): `Option`\<[`Rule`](#rule)\>

##### Parameters

###### ruleset

[`Ruleset`](#ruleset)

###### tool

`string`

###### params

`unknown`

##### Returns

`Option`\<[`Rule`](#rule)\>

***

### RuleFile

> `const` **RuleFile**: `Schema.$Array`\<`Schema.Struct`\<\{ `level`: `Schema.Literals`\<readonly \[`"allow"`, `"deny"`, `"ask"`\]\>; `pattern`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>

Schema for the permission rule file format.

***

### RuleSchema

> `const` **RuleSchema**: `Schema.Struct`\<\{ `level`: `Schema.Literals`\<readonly \[`"allow"`, `"deny"`, `"ask"`\]\>; `pattern`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

Schema for one persisted permission rule.
