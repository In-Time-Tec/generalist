[**generalist**](./index)

***

[generalist](./index) / tasks

# tasks

## Type Aliases

### Item

> **Item** = *typeof* `Item.Type`

**`Experimental`**

One model-owned task list entry.

***

### Items

> **Items** = *typeof* `Items.Type`

**`Experimental`**

The complete journaled task list.

***

### Status

> **Status** = *typeof* `Status.Type`

**`Experimental`**

Lifecycle state of one journaled task.

***

### Update

> **Update** = *typeof* `Update.Type`

**`Experimental`**

One partial task edit sent through Runtime steering.

## Variables

### Item

> `const` **Item**: `Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<`Schema.String`\>; `status`: `Schema.Literals`\<readonly \[`"todo"`, `"doing"`, `"done"`\]\>; `title`: `Schema.String`; \}\>

**`Experimental`**

One model-owned task list entry.

***

### Items

> `const` **Items**: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<`Schema.String`\>; `status`: `Schema.Literals`\<readonly \[`"todo"`, `"doing"`, `"done"`\]\>; `title`: `Schema.String`; \}\>\>

**`Experimental`**

The complete journaled task list.

***

### layer

> `const` **layer**: () => `Layer`

**`Experimental`**

Add `tasks_read` and `tasks_write` to Agents running in this environment.

#### Returns

`Layer`

***

### Status

> `const` **Status**: `Schema.Literals`\<readonly \[`"todo"`, `"doing"`, `"done"`\]\>

**`Experimental`**

Lifecycle state of one journaled task.

***

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

### Update

> `const` **Update**: `Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<`Schema.NullOr`\<`Schema.String`\>\>; `status`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[`"todo"`, `"doing"`, `"done"`\]\>\>; `title`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

**`Experimental`**

One partial task edit sent through Runtime steering.

## References

### TaskItem

Renames and re-exports [Item](#item-1)

***

### TaskItems

Renames and re-exports [Items](#items-1)

***

### TaskStatus

Renames and re-exports [Status](#status-1)
