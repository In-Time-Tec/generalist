[**generalist**](../index)

***

[generalist](../index) / testing

# testing

## Namespaces

- [KernelProviderConformance](./namespaces/KernelProviderConformance)
- [TestModel](./namespaces/TestModel)

## Interfaces

### CodeExecutorConformanceOptions

Small provider seam used by the public CodeExecutor conformance suite.

#### Properties

##### assertClean?

> `readonly` `optional` **assertClean?**: `Effect`\<`void`, `never`, `never`\>

Inspect provider-owned resources after every Exit. The assertion must observe zero live invocation resources.

##### layer

> `readonly` **layer**: `Layer`\<[`CodeExecutor`](../generalist/namespaces/CodeExecutor#codeexecutor)\>

##### name

> `readonly` **name**: `string`

## Variables

### codeExecutorConformance

> `const` **codeExecutorConformance**: (`options`) => `void`

Register protocol and observable isolation requirements against a provider's public execute boundary.

These tests prove request/result semantics and provider behavior observable through that boundary. They do not prove
a vendor's physical isolate, microVM, or hypervisor implementation; providers must document that evidence separately.

#### Parameters

##### options

[`CodeExecutorConformanceOptions`](#codeexecutorconformanceoptions)

#### Returns

`void`

***

### Testing

> `const` **Testing**: `object`

Public conformance suites and certification reporting.

#### Type Declaration

##### blobStore

> `readonly` **blobStore**: *typeof* `blobStore`

##### memo

> `readonly` **memo**: *typeof* `memo`

##### memory

> `readonly` **memory**: *typeof* `memory`

##### report

> `readonly` **report**: `object`

###### report.write

> `readonly` **write**: *typeof* `write`

##### ruleStore

> `readonly` **ruleStore**: *typeof* `ruleStore`

##### runtimeDriver

> `readonly` **runtimeDriver**: *typeof* [`runtimeDriver`](../testing.runtime-driver#runtimedriver)

##### sandbox

> `readonly` **sandbox**: *typeof* `sandbox`
