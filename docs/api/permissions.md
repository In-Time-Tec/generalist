[**generalist**](./index)

***

[generalist](./index) / permissions

# permissions

## Classes

<a id="invalidrulefile"></a>

### InvalidRuleFile

A permission rule file failed JSON/YAML parsing or Rule schema validation.

#### Extends

- `InvalidRuleFile_base`

#### Constructors

<a id="constructor"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`InvalidRuleFile_base.hint`

<a id="issues"></a>

##### issues

> `readonly` **issues**: `string`

###### Inherited from

`InvalidRuleFile_base.issues`

<a id="path"></a>

##### path

> `readonly` **path**: `string`

###### Inherited from

`InvalidRuleFile_base.path`

***

<a id="permissionerror"></a>

### PermissionError

Permission service failure.

#### Extends

- `PermissionError_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PermissionError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`PermissionError_base.message`

***

<a id="permissions"></a>

### Permissions

#### Extends

- `Permissions_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="rulestore"></a>

### RuleStore

Remembered permission-rule persistence boundary.

#### Extends

- `RuleStore_base`

#### Constructors

<a id="constructor-3"></a>

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

<a id="allow"></a>

### Allow

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Allow"`

<a id="reason"></a>

##### reason?

> `readonly` `optional` **reason?**: `string`

***

<a id="ask"></a>

### Ask

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Ask"`

<a id="reason-1"></a>

##### reason?

> `readonly` `optional` **reason?**: `string`

<a id="token"></a>

##### token

> `readonly` **token**: `string`

***

<a id="deny"></a>

### Deny

#### Properties

<a id="_tag-2"></a>

##### \_tag

> `readonly` **\_tag**: `"Deny"`

<a id="reason-2"></a>

##### reason?

> `readonly` `optional` **reason?**: `string`

***

<a id="rule"></a>

### Rule

One ordered permission rule.

#### Properties

<a id="level"></a>

##### level

> `readonly` **level**: [`Level`](#level-1)

<a id="pattern"></a>

##### pattern

> `readonly` **pattern**: `string`

<a id="reason-3"></a>

##### reason?

> `readonly` `optional` **reason?**: `string`

***

<a id="ruleset"></a>

### Ruleset

Ordered permission ruleset.

#### Properties

<a id="fallback"></a>

##### fallback?

> `readonly` `optional` **fallback?**: [`Level`](#level-1)

<a id="rules"></a>

##### rules

> `readonly` **rules**: readonly [`Rule`](#rule)[]

***

<a id="rulestorefileoptions"></a>

### RuleStoreFileOptions

One JSON or YAML permission-rule file.

#### Properties

<a id="path-1"></a>

##### path

> `readonly` **path**: `string`

***

<a id="rulestoresqloptions"></a>

### RuleStoreSqlOptions

SQL permission-rule scope. Rules are stored and read per scope; pass a session id for
per-session rules. Defaults to `"global"`.

#### Properties

<a id="scope"></a>

##### scope?

> `readonly` `optional` **scope?**: `string`

***

<a id="service"></a>

### Service

Permission policy service boundary.

#### Properties

<a id="evaluate"></a>

##### evaluate

> `readonly` **evaluate**: (`request`) => `Effect`\<[`Decision`](#decision), [`PermissionError`](#permissionerror)\>

###### Parameters

###### request

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest)

###### Returns

`Effect`\<[`Decision`](#decision), [`PermissionError`](#permissionerror)\>

## Type Aliases

<a id="decision"></a>

### Decision

> **Decision** = [`Allow`](#allow) \| [`Deny`](#deny) \| [`Ask`](#ask)

Resolved policy decision for one tool call.

***

<a id="level-1"></a>

### Level

> **Level** = `"allow"` \| `"deny"` \| `"ask"`

What a matched permission rule grants.

***

<a id="rulestoreerror"></a>

### RuleStoreError

> **RuleStoreError** = [`PermissionError`](#permissionerror) \| [`InvalidRuleFile`](#invalidrulefile)

Permission rule persistence failure.

## Variables

<a id="evaluate-1"></a>

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

<a id="evaluatewithrules"></a>

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

<a id="layerallowall"></a>

### layerAllowAll

> `const` **layerAllowAll**: `Layer.Layer`\<[`Permissions`](#permissions)\>

Permission policy that allows every call.

***

<a id="layerfailclosed"></a>

### layerFailClosed

> `const` **layerFailClosed**: (`rules?`) => `Layer.Layer`\<[`Permissions`](#permissions)\>

Permission policy that asks before every unmatched call.

#### Parameters

##### rules?

`ReadonlyArray`\<[`Rule`](#rule)\>

#### Returns

`Layer.Layer`\<[`Permissions`](#permissions)\>

***

<a id="layerruleset"></a>

### layerRuleset

> `const` **layerRuleset**: (`ruleset`) => `Layer.Layer`\<[`Permissions`](#permissions)\>

Policy from a static ruleset.

#### Parameters

##### ruleset

[`Ruleset`](#ruleset)

#### Returns

`Layer.Layer`\<[`Permissions`](#permissions)\>

***

<a id="layerrulestorefile"></a>

### layerRuleStoreFile

> `const` **layerRuleStoreFile**: (`options`) => `Layer.Layer`\<[`RuleStore`](#rulestore), [`InvalidRuleFile`](#invalidrulefile) \| [`PermissionError`](#permissionerror), `FileSystem.FileSystem` \| `Path.Path`\>

A watched, atomically written JSON or YAML RuleStore.

#### Parameters

##### options

[`RuleStoreFileOptions`](#rulestorefileoptions)

#### Returns

`Layer.Layer`\<[`RuleStore`](#rulestore), [`InvalidRuleFile`](#invalidrulefile) \| [`PermissionError`](#permissionerror), `FileSystem.FileSystem` \| `Path.Path`\>

***

<a id="layerrulestorememory"></a>

### layerRuleStoreMemory

> `const` **layerRuleStoreMemory**: (`initialRules?`) => `Layer.Layer`\<[`RuleStore`](#rulestore)\>

Non-durable in-memory remembered-rule store.

#### Parameters

##### initialRules?

`ReadonlyArray`\<[`Rule`](#rule)\>

#### Returns

`Layer.Layer`\<[`RuleStore`](#rulestore)\>

***

<a id="layerrulestoresql"></a>

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

<a id="layerrulestoretest"></a>

### layerRuleStoreTest

> `const` **layerRuleStoreTest**: (`implementation`) => `Layer.Layer`\<[`RuleStore`](#rulestore)\>

#### Parameters

##### implementation

[`RuleStore`](#rulestore)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`RuleStore`](#rulestore)\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Permissions`](#permissions)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Permissions`](#permissions)\>

***

<a id="matches"></a>

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

<a id="matchrule"></a>

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

<a id="rulefile"></a>

### RuleFile

> `const` **RuleFile**: `Schema.$Array`\<`Schema.Struct`\<\{ `level`: `Schema.Literals`\<readonly \[`"allow"`, `"deny"`, `"ask"`\]\>; `pattern`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>

Schema for the permission rule file format.

***

<a id="ruleschema"></a>

### RuleSchema

> `const` **RuleSchema**: `Schema.Struct`\<\{ `level`: `Schema.Literals`\<readonly \[`"allow"`, `"deny"`, `"ask"`\]\>; `pattern`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

Schema for one persisted permission rule.
