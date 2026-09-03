[**generalist**](../../index)

***

[generalist](../../index) / [unstable.a2a](../index) / A2A

# A2A

## Classes

### A2A

**`Experimental`**

A2A adapter service.

#### Extends

- `A2A_base`

#### Constructors

##### Constructor

> **new A2A**(`_`): [`A2A`](#a2a)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`A2A`](#a2a)

###### Inherited from

`A2A_base.constructor`

## Interfaces

### Deployment

**`Experimental`**

One explicit A2A endpoint deployment.

#### Properties

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

**`Experimental`**

##### card

> `readonly` **card**: `AgentCard`

**`Experimental`**

***

### Service

**`Experimental`**

A configured A2A v1 request handler.

#### Properties

##### deployment

> `readonly` **deployment**: [`Deployment`](#deployment)

**`Experimental`**

##### handler

> `readonly` **handler**: `DefaultRequestHandler`

**`Experimental`**

## Variables

### layer

> `const` **layer**: (`deployment`) => `Layer.Layer`\<[`A2A`](#a2a), `never`, [`Runtime`](../../runtime/namespaces/Runtime#runtime)\>

**`Experimental`**

Provide one explicit A2A deployment over the caller's Runtime.

#### Parameters

##### deployment

[`Deployment`](#deployment)

#### Returns

`Layer.Layer`\<[`A2A`](#a2a), `never`, [`Runtime`](../../runtime/namespaces/Runtime#runtime)\>

***

### makeHandler

> `const` **makeHandler**: \{(`runtime`, `deployment`): `DefaultRequestHandler`; (`deployment`): (`runtime`) => `DefaultRequestHandler`; \}

**`Experimental`**

Construct the SDK handler while keeping Runtime as task authority.

#### Call Signature

> (`runtime`, `deployment`): `DefaultRequestHandler`

##### Parameters

###### runtime

[`Service`](../../runtime/namespaces/Runtime#service)

###### deployment

[`Deployment`](#deployment)

##### Returns

`DefaultRequestHandler`

#### Call Signature

> (`deployment`): (`runtime`) => `DefaultRequestHandler`

##### Parameters

###### deployment

[`Deployment`](#deployment)

##### Returns

(`runtime`) => `DefaultRequestHandler`
