[**generalist**](../index)

***

[generalist](../index) / testing

# testing

## Namespaces

- [KernelProviderConformance](./namespaces/KernelProviderConformance)
- [TestModel](./namespaces/TestModel)

## Interfaces

<a id="codeexecutorconformanceoptions"></a>

### CodeExecutorConformanceOptions

Small provider seam used by the public CodeExecutor conformance suite.

#### Properties

<a id="assertclean"></a>

##### assertClean?

> `readonly` `optional` **assertClean?**: `Effect`\<`void`, `never`, `never`\>

Inspect provider-owned resources after every Exit. The assertion must observe zero live invocation resources.

<a id="layer"></a>

##### layer

> `readonly` **layer**: `Layer`\<[`CodeExecutor`](../generalist/namespaces/CodeExecutor#codeexecutor)\>

<a id="name"></a>

##### name

> `readonly` **name**: `string`

## Variables

<a id="codeexecutorconformance"></a>

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

<a id="testing"></a>

### Testing

> `const` **Testing**: `object`

Public conformance suites and certification reporting.

#### Type Declaration

<a id="blobstore"></a>

##### blobStore

> `readonly` **blobStore**: *typeof* `blobStore`

<a id="memo"></a>

##### memo

> `readonly` **memo**: *typeof* `memo`

<a id="memory"></a>

##### memory

> `readonly` **memory**: *typeof* `memory`

<a id="report"></a>

##### report

> `readonly` **report**: `object`

###### report.write

> `readonly` **write**: *typeof* `write`

<a id="rulestore"></a>

##### ruleStore

> `readonly` **ruleStore**: *typeof* `ruleStore`

<a id="runtimedriver"></a>

##### runtimeDriver

> `readonly` **runtimeDriver**: *typeof* [`runtimeDriver`](../testing.runtime-driver#runtimedriver)

<a id="sandbox"></a>

##### sandbox

> `readonly` **sandbox**: *typeof* `sandbox`
