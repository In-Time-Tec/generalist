[**generalist**](../../index)

***

[generalist](../../index) / [pg](../index) / RuntimeSchema

# RuntimeSchema

## Type Aliases

### SchemaPlan

> **SchemaPlan** = [`SqlSchemaPlan`](../../runtime.sql-driver/index#sqlschemaplan)

## Variables

### apply

> `const` **apply**: (`source`) => `Effect.Effect`\<`void`, [`SchemaChecksumMismatch`](../../runtime.sql-driver/index#schemachecksummismatch) \| [`SchemaDirty`](../../runtime.sql-driver/index#schemadirty) \| [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed) \| [`SchemaUpgradeRequired`](../../runtime.sql-driver/index#schemaupgraderequired) \| [`SchemaVersionUnsupported`](../../runtime.sql-driver/index#schemaversionunsupported) \| `SqlError`, `SqlClient.SqlClient`\>

#### Parameters

##### source

`string`

#### Returns

`Effect.Effect`\<`void`, [`SchemaChecksumMismatch`](../../runtime.sql-driver/index#schemachecksummismatch) \| [`SchemaDirty`](../../runtime.sql-driver/index#schemadirty) \| [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed) \| [`SchemaUpgradeRequired`](../../runtime.sql-driver/index#schemaupgraderequired) \| [`SchemaVersionUnsupported`](../../runtime.sql-driver/index#schemaversionunsupported) \| `SqlError`, `SqlClient.SqlClient`\>

***

### check

> `const` **check**: (`source`) => `Effect.Effect`\<`void`, [`SchemaChecksumMismatch`](../../runtime.sql-driver/index#schemachecksummismatch) \| [`SchemaDirty`](../../runtime.sql-driver/index#schemadirty) \| [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed) \| [`SchemaUpgradeRequired`](../../runtime.sql-driver/index#schemaupgraderequired) \| [`SchemaVersionUnsupported`](../../runtime.sql-driver/index#schemaversionunsupported), `SqlClient.SqlClient`\>

#### Parameters

##### source

`string`

#### Returns

`Effect.Effect`\<`void`, [`SchemaChecksumMismatch`](../../runtime.sql-driver/index#schemachecksummismatch) \| [`SchemaDirty`](../../runtime.sql-driver/index#schemadirty) \| [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed) \| [`SchemaUpgradeRequired`](../../runtime.sql-driver/index#schemaupgraderequired) \| [`SchemaVersionUnsupported`](../../runtime.sql-driver/index#schemaversionunsupported), `SqlClient.SqlClient`\>

***

### layerClient

> `const` **layerClient**: (`options`) => `Layer`

#### Parameters

##### options

###### maxConnections?

`number`

###### url

`string`

#### Returns

`Layer`

***

### markDirty

> `const` **markDirty**: (`source`) => `Effect.Effect`\<`void`, [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed), `SqlClient.SqlClient`\>

#### Parameters

##### source

`string`

#### Returns

`Effect.Effect`\<`void`, [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed), `SqlClient.SqlClient`\>

***

### plan

> `const` **plan**: (`source`) => `Effect.Effect`\<[`SchemaPlan`](#schemaplan), [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed), `SqlClient.SqlClient`\>

#### Parameters

##### source

`string`

#### Returns

`Effect.Effect`\<[`SchemaPlan`](#schemaplan), [`SchemaMigrationFailed`](../../runtime.sql-driver/index#schemamigrationfailed), `SqlClient.SqlClient`\>
