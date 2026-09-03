[**generalist**](./index)

***

[generalist](./index) / tasks

# tasks

## Type Aliases

<a id="item"></a>

### Item

> **Item** = *typeof* `Item.Type`

**`Experimental`**

One model-owned task list entry.

***

<a id="items"></a>

### Items

> **Items** = *typeof* `Items.Type`

**`Experimental`**

The complete journaled task list.

***

<a id="status"></a>

### Status

> **Status** = *typeof* `Status.Type`

**`Experimental`**

Lifecycle state of one journaled task.

***

<a id="update"></a>

### Update

> **Update** = *typeof* `Update.Type`

**`Experimental`**

One partial task edit sent through Runtime steering.

## Variables

<a id="item-1"></a>

### Item

> `const` **Item**: `Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<`Schema.String`\>; `status`: `Schema.Literals`\<readonly \[`"todo"`, `"doing"`, `"done"`\]\>; `title`: `Schema.String`; \}\>

**`Experimental`**

One model-owned task list entry.

***

<a id="items-1"></a>

### Items

> `const` **Items**: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<`Schema.String`\>; `status`: `Schema.Literals`\<readonly \[`"todo"`, `"doing"`, `"done"`\]\>; `title`: `Schema.String`; \}\>\>

**`Experimental`**

The complete journaled task list.

***

<a id="layer"></a>

### layer

> `const` **layer**: () => `Layer`

**`Experimental`**

Add `tasks_read` and `tasks_write` to Agents running in this environment.

#### Returns

`Layer`

***

<a id="status-1"></a>

### Status

> `const` **Status**: `Schema.Literals`\<readonly \[`"todo"`, `"doing"`, `"done"`\]\>

**`Experimental`**

Lifecycle state of one journaled task.

***

<a id="update-1"></a>

### update

> `const` **update**: (`updates`) => `Prompt.Prompt`

**`Experimental`**

Build a steering prompt that applies partial edits through one complete `tasks_write`.

#### Parameters

##### updates

`ReadonlyArray`\<[`Update`](#update)\>

#### Returns

`Prompt.Prompt`

***

<a id="update-2"></a>

### Update

> `const` **Update**: `Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<`Schema.NullOr`\<`Schema.String`\>\>; `status`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[`"todo"`, `"doing"`, `"done"`\]\>\>; `title`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

**`Experimental`**

One partial task edit sent through Runtime steering.

## References

<a id="taskitem"></a>

### TaskItem

Renames and re-exports [Item](#item-1)

***

<a id="taskitems"></a>

### TaskItems

Renames and re-exports [Items](#items-1)

***

<a id="taskstatus"></a>

### TaskStatus

Renames and re-exports [Status](#status-1)
