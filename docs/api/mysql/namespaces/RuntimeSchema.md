[**generalist**](../../index)

***

[generalist](../../index) / [mysql](../index) / RuntimeSchema

# RuntimeSchema

## Type Aliases

<a id="schemaplan"></a>

### SchemaPlan

> **SchemaPlan** = [`SqlSchemaPlan`](../../runtime.sql-driver/index#sqlschemaplan)

## Variables

<a id="apply"></a>

### apply

> `const` **apply**: (`source`) => `Effect.Effect`\<`void`, [`SchemaChecksumMismatch`](../../runtime.sql-driver/index#schemachecksummismatch) \| [`SchemaDirty`](../../runtime.sql-driver/index#schemadirty) \| [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed) \| [`SchemaUpgradeRequired`](../../runtime.sql-driver/index#schemaupgraderequired) \| [`SchemaVersionUnsupported`](../../runtime.sql-driver/index#schemaversionunsupported), `SqlClient.SqlClient`\>

#### Parameters

##### source

`string`

#### Returns

`Effect.Effect`\<`void`, [`SchemaChecksumMismatch`](../../runtime.sql-driver/index#schemachecksummismatch) \| [`SchemaDirty`](../../runtime.sql-driver/index#schemadirty) \| [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed) \| [`SchemaUpgradeRequired`](../../runtime.sql-driver/index#schemaupgraderequired) \| [`SchemaVersionUnsupported`](../../runtime.sql-driver/index#schemaversionunsupported), `SqlClient.SqlClient`\>

***

<a id="check"></a>

### check

> `const` **check**: (`source`) => `Effect.Effect`\<`void`, [`SchemaChecksumMismatch`](../../runtime.sql-driver/index#schemachecksummismatch) \| [`SchemaDirty`](../../runtime.sql-driver/index#schemadirty) \| [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed) \| [`SchemaUpgradeRequired`](../../runtime.sql-driver/index#schemaupgraderequired) \| [`SchemaVersionUnsupported`](../../runtime.sql-driver/index#schemaversionunsupported), `SqlClient.SqlClient`\>

#### Parameters

##### source

`string`

#### Returns

`Effect.Effect`\<`void`, [`SchemaChecksumMismatch`](../../runtime.sql-driver/index#schemachecksummismatch) \| [`SchemaDirty`](../../runtime.sql-driver/index#schemadirty) \| [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed) \| [`SchemaUpgradeRequired`](../../runtime.sql-driver/index#schemaupgraderequired) \| [`SchemaVersionUnsupported`](../../runtime.sql-driver/index#schemaversionunsupported), `SqlClient.SqlClient`\>

***

<a id="markdirty"></a>

### markDirty

> `const` **markDirty**: (`source`) => `Effect.Effect`\<`void`, [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed), `SqlClient.SqlClient`\>

#### Parameters

##### source

`string`

#### Returns

`Effect.Effect`\<`void`, [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed), `SqlClient.SqlClient`\>

***

<a id="plan"></a>

### plan

> `const` **plan**: (`source`) => `Effect.Effect`\<[`SchemaPlan`](#schemaplan), [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed), `SqlClient.SqlClient`\>

#### Parameters

##### source

`string`

#### Returns

`Effect.Effect`\<[`SchemaPlan`](#schemaplan), [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed), `SqlClient.SqlClient`\>
