[**generalist**](../../index)

***

[generalist](../../index) / [unstable.a2a](../index) / A2A

# A2A

## Classes

<a id="a2a"></a>

### A2A

**`Experimental`**

A2A adapter service.

#### Extends

- `A2A_base`

#### Constructors

<a id="constructor"></a>

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

<a id="deployment"></a>

### Deployment

**`Experimental`**

One explicit A2A endpoint deployment.

#### Properties

<a id="address"></a>

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

**`Experimental`**

<a id="card"></a>

##### card

> `readonly` **card**: `AgentCard`

**`Experimental`**

***

<a id="service"></a>

### Service

**`Experimental`**

A configured A2A v1 request handler.

#### Properties

<a id="deployment-1"></a>

##### deployment

> `readonly` **deployment**: [`Deployment`](#deployment)

**`Experimental`**

<a id="handler"></a>

##### handler

> `readonly` **handler**: `DefaultRequestHandler`

**`Experimental`**

## Variables

<a id="layer"></a>

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

<a id="makehandler"></a>

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
