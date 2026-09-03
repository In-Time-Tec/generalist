[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / RunExecutor

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

> `const` **layer**: `Layer.Layer`\<[`RunExecutor`](#runexecutor), `never`, `ActiveExecutions` \| [`ExecutableResolver`](./ExecutableResolver#executableresolver) \| [`RunStore`](./RunStore#runstore)\>

***

<a id="layerregisteredagents"></a>

### layerRegisteredAgents

> `const` **layerRegisteredAgents**: (`agents`) => `Layer.Layer`\<[`RunExecutor`](#runexecutor), `never`, `ActiveExecutions` \| [`ExecutableResolver`](./ExecutableResolver#executableresolver) \| [`RunStore`](./RunStore#runstore)\>

#### Parameters

##### agents

`RegisteredAgents`

#### Returns

`Layer.Layer`\<[`RunExecutor`](#runexecutor), `never`, `ActiveExecutions` \| [`ExecutableResolver`](./ExecutableResolver#executableresolver) \| [`RunStore`](./RunStore#runstore)\>
