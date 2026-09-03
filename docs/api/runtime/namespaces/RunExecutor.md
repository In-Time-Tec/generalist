[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / RunExecutor

# RunExecutor

## Classes

### RunExecutor

#### Extends

- `RunExecutor_base`

#### Constructors

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

### Service

#### Properties

##### execute

> `readonly` **execute**: (`claim`) => `Effect`\<`void`\>

###### Parameters

###### claim

`ExecutionClaim`

###### Returns

`Effect`\<`void`\>

##### interrupt

> `readonly` **interrupt**: (`runId`) => `Effect`\<`void`\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`\>

## Variables

### layer

> `const` **layer**: `Layer.Layer`\<[`RunExecutor`](#runexecutor), `never`, `ActiveExecutions` \| [`ExecutableResolver`](./ExecutableResolver#executableresolver) \| [`RunStore`](./RunStore#runstore)\>

***

### layerRegisteredAgents

> `const` **layerRegisteredAgents**: (`agents`) => `Layer.Layer`\<[`RunExecutor`](#runexecutor), `never`, `ActiveExecutions` \| [`ExecutableResolver`](./ExecutableResolver#executableresolver) \| [`RunStore`](./RunStore#runstore)\>

#### Parameters

##### agents

`RegisteredAgents`

#### Returns

`Layer.Layer`\<[`RunExecutor`](#runexecutor), `never`, `ActiveExecutions` \| [`ExecutableResolver`](./ExecutableResolver#executableresolver) \| [`RunStore`](./RunStore#runstore)\>
