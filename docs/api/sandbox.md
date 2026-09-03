[**generalist**](./index)

***

[generalist](./index) / sandbox

# sandbox

## Classes

### ExecutionFailed

The command failed after being admitted by the sandbox.

#### Extends

- `ExecutionFailed_base`

#### Constructors

##### Constructor

> **new ExecutionFailed**(...`args`): [`ExecutionFailed`](#executionfailed)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExecutionFailed`](#executionfailed)

###### Inherited from

`ExecutionFailed_base.constructor`

#### Properties

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`ExecutionFailed_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutionFailed_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`ExecutionFailed_base.message`

***

### LimitExceeded

A sandbox stopped work at an enforced resource limit.

#### Extends

- `LimitExceeded_base`

#### Constructors

##### Constructor

> **new LimitExceeded**(...`args`): [`LimitExceeded`](#limitexceeded)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`LimitExceeded`](#limitexceeded)

###### Inherited from

`LimitExceeded_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`LimitExceeded_base.hint`

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`LimitExceeded_base.limit`

##### resource

> `readonly` **resource**: `"cpu"` \| `"memory"` \| `"wall-clock"`

###### Inherited from

`LimitExceeded_base.resource`

***

### Sandbox

Acquired sandbox service tag.

#### Extends

- `Sandbox_base`

#### Constructors

##### Constructor

> **new Sandbox**(`_`): [`Sandbox`](#sandbox)

###### Parameters

###### \_

`never`

###### Returns

[`Sandbox`](#sandbox)

###### Inherited from

`Sandbox_base.constructor`

***

### SandboxProvider

Sandbox provider service tag.

#### Extends

- `SandboxProvider_base`

#### Constructors

##### Constructor

> **new SandboxProvider**(`_`): [`SandboxProvider`](#sandboxprovider)

###### Parameters

###### \_

`never`

###### Returns

[`SandboxProvider`](#sandboxprovider)

###### Inherited from

`SandboxProvider_base.constructor`

***

### SnapshotNotFound

An immutable sandbox image is unavailable to this provider.

#### Extends

- `SnapshotNotFound_base`

#### Constructors

##### Constructor

> **new SnapshotNotFound**(...`args`): [`SnapshotNotFound`](#snapshotnotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SnapshotNotFound`](#snapshotnotfound)

###### Inherited from

`SnapshotNotFound_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SnapshotNotFound_base.hint`

##### snapshotId

> `readonly` **snapshotId**: `string`

###### Inherited from

`SnapshotNotFound_base.snapshotId`

***

### Unavailable

The provider could not acquire or reach the sandbox.

#### Extends

- `Unavailable_base`

#### Constructors

##### Constructor

> **new Unavailable**(...`args`): [`Unavailable`](#unavailable)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Unavailable`](#unavailable)

###### Inherited from

`Unavailable_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Unavailable_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`Unavailable_base.message`

***

### Unsupported

The leaf does not implement the requested capability.

#### Extends

- `Unsupported_base`

#### Constructors

##### Constructor

> **new Unsupported**(...`args`): [`Unsupported`](#unsupported)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Unsupported`](#unsupported)

###### Inherited from

`Unsupported_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Unsupported_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`Unsupported_base.message`

##### operation

> `readonly` **operation**: `"pause"` \| `"fork"` \| `"snapshot"` \| `"resume"` \| `"exec:process"` \| `"exec:typescript"` \| `"exec:javascript-module"` \| `"files"` \| `"limit:cpu"` \| `"limit:memory"` \| `"limit:wall-clock"`

###### Inherited from

`Unsupported_base.operation`

## Interfaces

### AcquireOptions

One provider acquisition request. A key asks a stateful provider for the same logical sandbox.

#### Properties

##### image?

> `readonly` `optional` **image?**: `string`

##### key?

> `readonly` `optional` **key?**: `string`

##### limits?

> `readonly` `optional` **limits?**: `object`

###### cpuMs?

> `readonly` `optional` **cpuMs?**: `number`

###### memoryMb?

> `readonly` `optional` **memoryMb?**: `number`

###### wallClock?

> `readonly` `optional` **wallClock?**: `Duration`

***

### BunKernelOptions

Bun kernel provider configuration.

#### Properties

##### image

> `readonly` **image**: `string`

##### limits?

> `readonly` `optional` **limits?**: `object`

###### cpuMs?

> `readonly` `optional` **cpuMs?**: `number`

###### memoryMb?

> `readonly` `optional` **memoryMb?**: `number`

###### wallClock?

> `readonly` `optional` **wallClock?**: `Duration`

##### workspaceRoot

> `readonly` **workspaceRoot**: `string`

***

### Capabilities

Command, lifecycle, and limit capabilities declared by one acquired sandbox.

#### Properties

##### commands

> `readonly` **commands**: readonly (`"Process"` \| `"TypeScript"` \| `"JavaScriptModule"`)[]

##### files

> `readonly` **files**: `boolean`

##### fork

> `readonly` **fork**: `boolean`

##### limits

> `readonly` **limits**: readonly (`"cpu"` \| `"memory"` \| `"wall-clock"`)[]

##### pause

> `readonly` **pause**: `boolean`

##### resume

> `readonly` **resume**: `boolean`

##### snapshot

> `readonly` **snapshot**: `boolean`

***

### Execution

One command in flight. The caller's Scope owns its resources.

#### Properties

##### events

> `readonly` **events**: `Stream`\<\{ `channel`: `"stdout"` \| `"stderr"`; `text`: `string`; \} \| \{ `value`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

##### result

> `readonly` **result**: `Effect`\<\{ `exitCode`: `number`; `stderr`: `string`; `stdout`: `string`; `value?`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

***

### JavaScriptModuleCommand

Exact JavaScript module invocation used by the Worker Loader leaf. The capability
service is process-local authority and is deliberately not serializable.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"JavaScriptModule"`

##### capabilities

> `readonly` **capabilities**: [`Service`](./generalist/namespaces/ProgramCapabilities#service)

##### request

> `readonly` **request**: [`Request`](./generalist/namespaces/CodeExecutor#request)

***

### SandboxProviderService

Provider that acquires sandboxes under the caller's Scope.

#### Properties

##### acquire

> `readonly` **acquire**: (`options?`) => `Effect`\<[`SandboxService`](#sandboxservice), [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound), `Scope`\>

###### Parameters

###### options?

[`AcquireOptions`](#acquireoptions)

###### Returns

`Effect`\<[`SandboxService`](#sandboxservice), [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound), `Scope`\>

##### defaultImage

> `readonly` **defaultImage**: `string`

***

### SandboxService

One acquired sandbox and its factual capabilities.

#### Properties

##### capabilities

> `readonly` **capabilities**: [`Capabilities`](#capabilities)

##### exec

> `readonly` **exec**: (`command`) => `Effect`\<\{ `exitCode`: `number`; `stderr`: `string`; `stdout`: `string`; `value?`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

###### Parameters

###### command

[`Command`](#command)

###### Returns

`Effect`\<\{ `exitCode`: `number`; `stderr`: `string`; `stdout`: `string`; `value?`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

##### files

> `readonly` **files**: `Effect`\<`FileSystem`, [`Unsupported`](#unsupported)\>

##### fork

> `readonly` **fork**: (`snapshotId`, `options?`) => `Effect`\<[`SandboxService`](#sandboxservice), [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

Restore an isolated image, optionally binding it for later keyed acquisition.

###### Parameters

###### snapshotId

`string`

###### options?

`Pick`\<[`AcquireOptions`](#acquireoptions), `"key"`\>

###### Returns

`Effect`\<[`SandboxService`](#sandboxservice), [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

##### isolation

> `readonly` **isolation**: `"container"` \| `"microvm"` \| `"process"` \| `"v8-isolate"`

##### limits

> `readonly` **limits**: `object`

###### cpuMs?

> `readonly` `optional` **cpuMs?**: `number`

###### memoryMb?

> `readonly` `optional` **memoryMb?**: `number`

###### wallClock?

> `readonly` `optional` **wallClock?**: `Duration`

##### pause

> `readonly` **pause**: `Effect`\<`void`, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

##### resume

> `readonly` **resume**: `Effect`\<`void`, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

##### snapshot

> `readonly` **snapshot**: `Effect`\<`string`, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

##### start

> `readonly` **start**: (`command`) => `Effect`\<[`Execution`](#execution), [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound), `Scope`\>

###### Parameters

###### command

[`Command`](#command)

###### Returns

`Effect`\<[`Execution`](#execution), [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound), `Scope`\>

##### stream

> `readonly` **stream**: (`command`) => `Stream`\<\{ `channel`: `"stdout"` \| `"stderr"`; `text`: `string`; \} \| \{ `value`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

###### Parameters

###### command

[`Command`](#command)

###### Returns

`Stream`\<\{ `channel`: `"stdout"` \| `"stderr"`; `text`: `string`; \} \| \{ `value`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

***

### WorktreeOptions

Git worktree sandbox configuration.

#### Properties

##### repo

> `readonly` **repo**: `string`

## Type Aliases

### Command

> **Command** = [`ProcessCommand`](#processcommand) \| [`TypeScriptCommand`](#typescriptcommand) \| [`JavaScriptModuleCommand`](#javascriptmodulecommand)

Closed command vocabulary implemented by current leaves. A provider returns
Unsupported for command kinds it does not implement rather than interpreting another kind.

***

### ExecEvent

> **ExecEvent** = *typeof* `ExecEvent.Type`

One ordered command event.

***

### ExecResult

> **ExecResult** = *typeof* `ExecResult.Type`

Collected terminal command result.

***

### Isolation

> **Isolation** = *typeof* `Isolation.Type`

Factual physical boundary. It is not a security rating.

***

### Limits

> **Limits** = *typeof* `Limits.Type`

Limits requested from and enforced by a sandbox provider.

***

### Metadata

> **Metadata** = *typeof* `Metadata.Type`

Provider-specific structured progress retained for a typed adapter.

***

### Operation

> **Operation** = *typeof* `Operation.Type`

Sandbox operation that a leaf may report as unsupported.

***

### Output

> **Output** = *typeof* `Output.Type`

One streaming write from a sandbox command.

***

### ProcessCommand

> **ProcessCommand** = *typeof* `ProcessCommand.Type`

A normal process invocation for providers that expose an operating-system command boundary.

***

### SandboxError

> **SandboxError** = *typeof* `SandboxError.Type`

Closed failure union for the provider-neutral sandbox boundary.

***

### SnapshotId

> **SnapshotId** = *typeof* `SnapshotId.Type`

Durable provider identity for one immutable sandbox image.

***

### TypeScriptCommand

> **TypeScriptCommand** = *typeof* `TypeScriptCommand.Type`

One stateful TypeScript cell evaluated in a sandbox-owned namespace.

## Variables

### ExecEvent

> `const` **ExecEvent**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Output"`, \{ `channel`: `Schema.Literals`\<readonly \[`"stdout"`, `"stderr"`\]\>; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Metadata"`, \{ `value`: `Schema.Unknown`; \}\>\]\>

One ordered command event.

***

### ExecResult

> `const` **ExecResult**: `Schema.Struct`\<\{ `exitCode`: `Schema.Int`; `stderr`: `Schema.String`; `stdout`: `Schema.String`; `value`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>

Collected terminal command result.

***

### Isolation

> `const` **Isolation**: `Schema.Literals`\<readonly \[`"process"`, `"v8-isolate"`, `"container"`, `"microvm"`\]\>

Factual physical boundary. It is not a security rating.

***

### layerBunKernel

> `const` **layerBunKernel**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](#sandboxprovider), `never`, `FileSystem.FileSystem` \| [`KernelPool`](./repl/namespaces/KernelPool#kernelpool) \| [`KernelSnapshotStore`](./repl/namespaces/KernelSnapshotStore#kernelsnapshotstore) \| `Path.Path`\>

Provide the process-isolated BunKernel Sandbox leaf.

#### Parameters

##### options

[`BunKernelOptions`](#bunkerneloptions)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](#sandboxprovider), `never`, `FileSystem.FileSystem` \| [`KernelPool`](./repl/namespaces/KernelPool#kernelpool) \| [`KernelSnapshotStore`](./repl/namespaces/KernelSnapshotStore#kernelsnapshotstore) \| `Path.Path`\>

***

### layerWorktree

> `const` **layerWorktree**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](#sandboxprovider), `never`, `FileSystem.FileSystem` \| `Path.Path` \| `ChildProcessSpawner.ChildProcessSpawner`\>

Provide a process-isolated Sandbox whose snapshots are hidden Git commits and whose forks are worktrees.

#### Parameters

##### options

[`WorktreeOptions`](#worktreeoptions)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](#sandboxprovider), `never`, `FileSystem.FileSystem` \| `Path.Path` \| `ChildProcessSpawner.ChildProcessSpawner`\>

***

### Limits

> `const` **Limits**: `Schema.Struct`\<\{ `cpuMs`: `Schema.optionalKey`\<`Schema.Int`\>; `memoryMb`: `Schema.optionalKey`\<`Schema.Int`\>; `wallClock`: `Schema.optionalKey`\<`Schema.DurationFromMillis`\>; \}\>

Limits requested from and enforced by a sandbox provider.

***

### make

> `const` **make**: (`input`) => [`SandboxService`](#sandboxservice)

Construct collected and streaming variants from one scoped command start operation.

#### Parameters

##### input

`Omit`\<[`SandboxService`](#sandboxservice), `"exec"` \| `"stream"`\>

#### Returns

[`SandboxService`](#sandboxservice)

***

### makeBunKernelProvider

> `const` **makeBunKernelProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](#sandboxproviderservice), `never`, `FileSystem.FileSystem` \| [`KernelPool`](./repl/namespaces/KernelPool#kernelpool) \| [`KernelSnapshotStore`](./repl/namespaces/KernelSnapshotStore#kernelsnapshotstore) \| `Path.Path`\>

Construct a provider over an existing BunKernelPool and BunKernelSnapshotStore.

#### Parameters

##### options

[`BunKernelOptions`](#bunkerneloptions)

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](#sandboxproviderservice), `never`, `FileSystem.FileSystem` \| [`KernelPool`](./repl/namespaces/KernelPool#kernelpool) \| [`KernelSnapshotStore`](./repl/namespaces/KernelSnapshotStore#kernelsnapshotstore) \| `Path.Path`\>

***

### Metadata

> `const` **Metadata**: `Schema.TaggedStruct`\<`"Metadata"`, \{ `value`: `Schema.Unknown`; \}\>

Provider-specific structured progress retained for a typed adapter.

***

### Operation

> `const` **Operation**: `Schema.Literals`\<readonly \[`"exec:process"`, `"exec:typescript"`, `"exec:javascript-module"`, `"files"`, `"pause"`, `"resume"`, `"snapshot"`, `"fork"`, `"limit:cpu"`, `"limit:memory"`, `"limit:wall-clock"`\]\>

Sandbox operation that a leaf may report as unsupported.

***

### Output

> `const` **Output**: `Schema.TaggedStruct`\<`"Output"`, \{ `channel`: `Schema.Literals`\<readonly \[`"stdout"`, `"stderr"`\]\>; `text`: `Schema.String`; \}\>

One streaming write from a sandbox command.

***

### ProcessCommand

> `const` **ProcessCommand**: `Schema.TaggedStruct`\<`"Process"`, \{ `arguments`: `Schema.$Array`\<`Schema.String`\>; `command`: `Schema.String`; `cwd`: `Schema.optionalKey`\<`Schema.String`\>; `environment`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.String`\>\>; `stdin`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

A normal process invocation for providers that expose an operating-system command boundary.

***

### SandboxError

> `const` **SandboxError**: `Schema.Union`\<readonly \[*typeof* [`Unsupported`](#unsupported), *typeof* [`Unavailable`](#unavailable), *typeof* [`ExecutionFailed`](#executionfailed), *typeof* [`LimitExceeded`](#limitexceeded), *typeof* [`SnapshotNotFound`](#snapshotnotfound)\]\>

Closed failure union for the provider-neutral sandbox boundary.

***

### SnapshotId

> `const` **SnapshotId**: `Schema.String`

Durable provider identity for one immutable sandbox image.

***

### TypeScriptCommand

> `const` **TypeScriptCommand**: `Schema.TaggedStruct`\<`"TypeScript"`, \{ `cellId`: `Schema.String`; `source`: `Schema.String`; \}\>

One stateful TypeScript cell evaluated in a sandbox-owned namespace.
