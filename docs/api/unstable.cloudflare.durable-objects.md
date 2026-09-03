[**generalist**](./index)

***

[generalist](./index) / unstable.cloudflare.durable-objects

# unstable.cloudflare.durable-objects

## Type Aliases

<a id="durableobjectstorage"></a>

### DurableObjectStorage

> **DurableObjectStorage** = `NonNullable`\<`Parameters`\<*typeof* `SqliteClient.make`\>\[`0`\]\[`"storage"`\]\>

**`Experimental`**

## Variables

<a id="layerrunstore"></a>

### layerRunStore

> `const` **layerRunStore**: (`options`) => `Layer.Layer`\<[`RunStore`](./runtime/namespaces/RunStore#runstore) \| [`ExternalChildStore`](./unstable.runtime.external-child-store#externalchildstore), [`SqliteStoreError`](./runtime.sql-driver/index#sqlitestoreerror), `SqlClient.SqlClient`\>

**`Experimental`**

#### Parameters

##### options

[`SqliteStoreOptions`](./runtime.sql-driver/index#sqlitestoreoptions)

#### Returns

`Layer.Layer`\<[`RunStore`](./runtime/namespaces/RunStore#runstore) \| [`ExternalChildStore`](./unstable.runtime.external-child-store#externalchildstore), [`SqliteStoreError`](./runtime.sql-driver/index#sqlitestoreerror), `SqlClient.SqlClient`\>

***

<a id="layersqlclient"></a>

### layerSqlClient

> `const` **layerSqlClient**: (`storage`) => `Layer.Layer`\<`SqlClient.SqlClient` \| `SqliteClient.SqliteClient`\>

**`Experimental`**

#### Parameters

##### storage

[`DurableObjectStorage`](#durableobjectstorage)

#### Returns

`Layer.Layer`\<`SqlClient.SqlClient` \| `SqliteClient.SqliteClient`\>

***

<a id="makesqlclient"></a>

### makeSqlClient

> `const` **makeSqlClient**: (`storage`) => `Effect`

**`Experimental`**

#### Parameters

##### storage

[`DurableObjectStorage`](#durableobjectstorage)

#### Returns

`Effect`
