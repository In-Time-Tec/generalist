[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / Authorship

# Authorship

## Classes

### AuthorshipRejected

Untrusted proposal input was refused and no state was inspected or changed.

#### Extends

- `AuthorshipRejected_base`

#### Constructors

##### Constructor

> **new AuthorshipRejected**(...`args`): [`AuthorshipRejected`](#authorshiprejected)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AuthorshipRejected`](#authorshiprejected)

###### Inherited from

`AuthorshipRejected_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AuthorshipRejected_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`AuthorshipRejected_base.message`

##### reason

> `readonly` **reason**: `"pinned-revision"` \| `"malformed"`

###### Inherited from

`AuthorshipRejected_base.reason`

## Type Aliases

### AuthorshipRejection

> **AuthorshipRejection** = *typeof* `AuthorshipRejection.Type`

Why untrusted proposal input was refused before it could reach the engine.

## Variables

### author

> `const` **author**: (`input`, `options?`) => `Effect.Effect`\<[`AuthoredRefinementProposal`](./Entry#authoredrefinementproposal), [`AuthorshipRejected`](#authorshiprejected), `never`\>

Accept one proposal from an untrusted author. A pinned `revision` is refused rather than trusted or
silently dropped, so model-originated input can never choose an entry's createdAt, updatedAt, or version.

#### Parameters

##### input

`unknown`

##### options?

`ParseOptions`

#### Returns

`Effect.Effect`\<[`AuthoredRefinementProposal`](./Entry#authoredrefinementproposal), [`AuthorshipRejected`](#authorshiprejected), `never`\>

***

### AuthorshipRejection

> `const` **AuthorshipRejection**: `Schema.Literals`\<readonly \[`"pinned-revision"`, `"malformed"`\]\>

Why untrusted proposal input was refused before it could reach the engine.

## References

### isAuthored

Re-exports [isAuthored](./Refinement#isauthored)
