[**generalist**](./index)

***

[generalist](./index) / unstable.cloudflare.durable-objects

# unstable.cloudflare.durable-objects

## Type Aliases

### DurableObjectStorage

> **DurableObjectStorage** = `NonNullable`\<`Parameters`\<*typeof* `SqliteClient.make`\>\[`0`\]\[`"storage"`\]\>

**`Experimental`**

## Variables

### layerRunStore

> `const` **layerRunStore**: (`options`) => `Layer.Layer`\<[`RunStore`](./runtime/namespaces/RunStore#runstore) \| [`ExternalChildStore`](./unstable.runtime.external-child-store#externalchildstore), [`SqliteStoreError`](./runtime.sql-driver/index#sqlitestoreerror), `SqlClient.SqlClient`\>

**`Experimental`**

#### Parameters

##### options

[`SqliteStoreOptions`](./runtime.sql-driver/index#sqlitestoreoptions)

#### Returns

`Layer.Layer`\<[`RunStore`](./runtime/namespaces/RunStore#runstore) \| [`ExternalChildStore`](./unstable.runtime.external-child-store#externalchildstore), [`SqliteStoreError`](./runtime.sql-driver/index#sqlitestoreerror), `SqlClient.SqlClient`\>

***

### layerSqlClient

> `const` **layerSqlClient**: (`storage`) => `Layer.Layer`\<`SqlClient.SqlClient` \| `SqliteClient.SqliteClient`\>

**`Experimental`**

#### Parameters

##### storage

[`DurableObjectStorage`](#durableobjectstorage)

#### Returns

`Layer.Layer`\<`SqlClient.SqlClient` \| `SqliteClient.SqliteClient`\>

***

### makeSqlClient

> `const` **makeSqlClient**: (`storage`) => `Effect`

**`Experimental`**

#### Parameters

##### storage

[`DurableObjectStorage`](#durableobjectstorage)

#### Returns

`Effect`
