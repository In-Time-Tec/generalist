[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / RunExecutor

# RunExecutor

## Classes

<a id="runexecutor"></a>

### RunExecutor

#### Extends

- `RunExecutor_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new RunExecutor**(`_`): [`RunExecutor`](#runexecutor)

###### Parameters

###### \_

`never`

###### Returns

[`RunExecutor`](#runexecutor)

###### Inherited from

`RunExecutor_base.constructor`

## Interfaces

<a id="service"></a>

### Service

#### Properties

<a id="execute"></a>

##### execute

> `readonly` **execute**: (`claim`) => `Effect`\<`void`\>

###### Parameters

###### claim

`ExecutionClaim`

###### Returns

`Effect`\<`void`\>

<a id="interrupt"></a>

##### interrupt

> `readonly` **interrupt**: (`runId`) => `Effect`\<`void`\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`\>

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: `Layer.Layer`\<[`RunExecutor`](#runexecutor), `never`, `ActiveExecutions` \| [`ExecutableResolver`](./ExecutableResolver.md#executableresolver) \| [`RunStore`](./RunStore.md#runstore)\>

***

<a id="layerregisteredagents"></a>

### layerRegisteredAgents

> `const` **layerRegisteredAgents**: (`agents`) => `Layer.Layer`\<[`RunExecutor`](#runexecutor), `never`, `ActiveExecutions` \| [`ExecutableResolver`](./ExecutableResolver.md#executableresolver) \| [`RunStore`](./RunStore.md#runstore)\>

#### Parameters

##### agents

`RegisteredAgents`

#### Returns

`Layer.Layer`\<[`RunExecutor`](#runexecutor), `never`, `ActiveExecutions` \| [`ExecutableResolver`](./ExecutableResolver.md#executableresolver) \| [`RunStore`](./RunStore.md#runstore)\>
