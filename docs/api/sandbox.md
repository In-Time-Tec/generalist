[**generalist**](./index)

***

[generalist](./index) / sandbox

# sandbox

## Classes

<a id="executionfailed"></a>

### ExecutionFailed

The command failed after being admitted by the sandbox.

#### Extends

- `ExecutionFailed_base`

#### Constructors

<a id="constructor"></a>

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

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`ExecutionFailed_base.cause`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutionFailed_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`ExecutionFailed_base.message`

***

<a id="limitexceeded"></a>

### LimitExceeded

A sandbox stopped work at an enforced resource limit.

#### Extends

- `LimitExceeded_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`LimitExceeded_base.hint`

<a id="limit"></a>

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`LimitExceeded_base.limit`

<a id="resource"></a>

##### resource

> `readonly` **resource**: `"cpu"` \| `"memory"` \| `"wall-clock"`

###### Inherited from

`LimitExceeded_base.resource`

***

<a id="sandbox"></a>

### Sandbox

Acquired sandbox service tag.

#### Extends

- `Sandbox_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="sandboxprovider"></a>

### SandboxProvider

Sandbox provider service tag.

#### Extends

- `SandboxProvider_base`

#### Constructors

<a id="constructor-3"></a>

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

<a id="snapshotnotfound"></a>

### SnapshotNotFound

An immutable sandbox image is unavailable to this provider.

#### Extends

- `SnapshotNotFound_base`

#### Constructors

<a id="constructor-4"></a>

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

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SnapshotNotFound_base.hint`

<a id="snapshotid"></a>

##### snapshotId

> `readonly` **snapshotId**: `string`

###### Inherited from

`SnapshotNotFound_base.snapshotId`

***

<a id="unavailable"></a>

### Unavailable

The provider could not acquire or reach the sandbox.

#### Extends

- `Unavailable_base`

#### Constructors

<a id="constructor-5"></a>

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

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Unavailable_base.hint`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`Unavailable_base.message`

***

<a id="unsupported"></a>

### Unsupported

The leaf does not implement the requested capability.

#### Extends

- `Unsupported_base`

#### Constructors

<a id="constructor-6"></a>

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

<a id="hint-4"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Unsupported_base.hint`

<a id="message-2"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`Unsupported_base.message`

<a id="operation"></a>

##### operation

> `readonly` **operation**: `"pause"` \| `"fork"` \| `"snapshot"` \| `"resume"` \| `"exec:process"` \| `"exec:typescript"` \| `"exec:javascript-module"` \| `"files"` \| `"limit:cpu"` \| `"limit:memory"` \| `"limit:wall-clock"`

###### Inherited from

`Unsupported_base.operation`

## Interfaces

<a id="acquireoptions"></a>

### AcquireOptions

One provider acquisition request. A key asks a stateful provider for the same logical sandbox.

#### Properties

<a id="image"></a>

##### image?

> `readonly` `optional` **image?**: `string`

<a id="key"></a>

##### key?

> `readonly` `optional` **key?**: `string`

<a id="limits"></a>

##### limits?

> `readonly` `optional` **limits?**: `object`

###### cpuMs?

> `readonly` `optional` **cpuMs?**: `number`

###### memoryMb?

> `readonly` `optional` **memoryMb?**: `number`

###### wallClock?

> `readonly` `optional` **wallClock?**: `Duration`

***

<a id="bunkerneloptions"></a>

### BunKernelOptions

Bun kernel provider configuration.

#### Properties

<a id="image-1"></a>

##### image

> `readonly` **image**: `string`

<a id="limits-1"></a>

##### limits?

> `readonly` `optional` **limits?**: `object`

###### cpuMs?

> `readonly` `optional` **cpuMs?**: `number`

###### memoryMb?

> `readonly` `optional` **memoryMb?**: `number`

###### wallClock?

> `readonly` `optional` **wallClock?**: `Duration`

<a id="workspaceroot"></a>

##### workspaceRoot

> `readonly` **workspaceRoot**: `string`

***

<a id="capabilities"></a>

### Capabilities

Command, lifecycle, and limit capabilities declared by one acquired sandbox.

#### Properties

<a id="commands"></a>

##### commands

> `readonly` **commands**: readonly (`"Process"` \| `"TypeScript"` \| `"JavaScriptModule"`)[]

<a id="files"></a>

##### files

> `readonly` **files**: `boolean`

<a id="fork"></a>

##### fork

> `readonly` **fork**: `boolean`

<a id="limits-2"></a>

##### limits

> `readonly` **limits**: readonly (`"cpu"` \| `"memory"` \| `"wall-clock"`)[]

<a id="pause"></a>

##### pause

> `readonly` **pause**: `boolean`

<a id="resume"></a>

##### resume

> `readonly` **resume**: `boolean`

<a id="snapshot"></a>

##### snapshot

> `readonly` **snapshot**: `boolean`

***

<a id="execution"></a>

### Execution

One command in flight. The caller's Scope owns its resources.

#### Properties

<a id="events"></a>

##### events

> `readonly` **events**: `Stream`\<\{ `channel`: `"stdout"` \| `"stderr"`; `text`: `string`; \} \| \{ `value`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

<a id="result"></a>

##### result

> `readonly` **result**: `Effect`\<\{ `exitCode`: `number`; `stderr`: `string`; `stdout`: `string`; `value?`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

***

<a id="javascriptmodulecommand"></a>

### JavaScriptModuleCommand

Exact JavaScript module invocation used by the Worker Loader leaf. The capability
service is process-local authority and is deliberately not serializable.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"JavaScriptModule"`

<a id="capabilities-1"></a>

##### capabilities

> `readonly` **capabilities**: [`Service`](./generalist/namespaces/ProgramCapabilities#service)

<a id="request"></a>

##### request

> `readonly` **request**: [`Request`](./generalist/namespaces/CodeExecutor#request)

***

<a id="sandboxproviderservice"></a>

### SandboxProviderService

Provider that acquires sandboxes under the caller's Scope.

#### Properties

<a id="acquire"></a>

##### acquire

> `readonly` **acquire**: (`options?`) => `Effect`\<[`SandboxService`](#sandboxservice), [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound), `Scope`\>

###### Parameters

###### options?

[`AcquireOptions`](#acquireoptions)

###### Returns

`Effect`\<[`SandboxService`](#sandboxservice), [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound), `Scope`\>

<a id="defaultimage"></a>

##### defaultImage

> `readonly` **defaultImage**: `string`

***

<a id="sandboxservice"></a>

### SandboxService

One acquired sandbox and its factual capabilities.

#### Properties

<a id="capabilities-2"></a>

##### capabilities

> `readonly` **capabilities**: [`Capabilities`](#capabilities)

<a id="exec"></a>

##### exec

> `readonly` **exec**: (`command`) => `Effect`\<\{ `exitCode`: `number`; `stderr`: `string`; `stdout`: `string`; `value?`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

###### Parameters

###### command

[`Command`](#command)

###### Returns

`Effect`\<\{ `exitCode`: `number`; `stderr`: `string`; `stdout`: `string`; `value?`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

<a id="files-1"></a>

##### files

> `readonly` **files**: `Effect`\<`FileSystem`, [`Unsupported`](#unsupported)\>

<a id="fork-1"></a>

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

<a id="isolation"></a>

##### isolation

> `readonly` **isolation**: `"container"` \| `"microvm"` \| `"process"` \| `"v8-isolate"`

<a id="limits-3"></a>

##### limits

> `readonly` **limits**: `object`

###### cpuMs?

> `readonly` `optional` **cpuMs?**: `number`

###### memoryMb?

> `readonly` `optional` **memoryMb?**: `number`

###### wallClock?

> `readonly` `optional` **wallClock?**: `Duration`

<a id="pause-1"></a>

##### pause

> `readonly` **pause**: `Effect`\<`void`, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

<a id="resume-1"></a>

##### resume

> `readonly` **resume**: `Effect`\<`void`, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

<a id="snapshot-1"></a>

##### snapshot

> `readonly` **snapshot**: `Effect`\<`string`, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

<a id="start"></a>

##### start

> `readonly` **start**: (`command`) => `Effect`\<[`Execution`](#execution), [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound), `Scope`\>

###### Parameters

###### command

[`Command`](#command)

###### Returns

`Effect`\<[`Execution`](#execution), [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound), `Scope`\>

<a id="stream"></a>

##### stream

> `readonly` **stream**: (`command`) => `Stream`\<\{ `channel`: `"stdout"` \| `"stderr"`; `text`: `string`; \} \| \{ `value`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

###### Parameters

###### command

[`Command`](#command)

###### Returns

`Stream`\<\{ `channel`: `"stdout"` \| `"stderr"`; `text`: `string`; \} \| \{ `value`: `unknown`; \}, [`Unsupported`](#unsupported) \| [`Unavailable`](#unavailable) \| [`ExecutionFailed`](#executionfailed) \| [`LimitExceeded`](#limitexceeded) \| [`SnapshotNotFound`](#snapshotnotfound)\>

***

<a id="worktreeoptions"></a>

### WorktreeOptions

Git worktree sandbox configuration.

#### Properties

<a id="repo"></a>

##### repo

> `readonly` **repo**: `string`

## Type Aliases

<a id="command"></a>

### Command

> **Command** = [`ProcessCommand`](#processcommand) \| [`TypeScriptCommand`](#typescriptcommand) \| [`JavaScriptModuleCommand`](#javascriptmodulecommand)

Closed command vocabulary implemented by current leaves. A provider returns
Unsupported for command kinds it does not implement rather than interpreting another kind.

***

<a id="execevent"></a>

### ExecEvent

> **ExecEvent** = *typeof* `ExecEvent.Type`

One ordered command event.

***

<a id="execresult"></a>

### ExecResult

> **ExecResult** = *typeof* `ExecResult.Type`

Collected terminal command result.

***

<a id="isolation-1"></a>

### Isolation

> **Isolation** = *typeof* `Isolation.Type`

Factual physical boundary. It is not a security rating.

***

<a id="limits-4"></a>

### Limits

> **Limits** = *typeof* `Limits.Type`

Limits requested from and enforced by a sandbox provider.

***

<a id="metadata"></a>

### Metadata

> **Metadata** = *typeof* `Metadata.Type`

Provider-specific structured progress retained for a typed adapter.

***

<a id="operation-1"></a>

### Operation

> **Operation** = *typeof* `Operation.Type`

Sandbox operation that a leaf may report as unsupported.

***

<a id="output"></a>

### Output

> **Output** = *typeof* `Output.Type`

One streaming write from a sandbox command.

***

<a id="processcommand"></a>

### ProcessCommand

> **ProcessCommand** = *typeof* `ProcessCommand.Type`

A normal process invocation for providers that expose an operating-system command boundary.

***

<a id="sandboxerror"></a>

### SandboxError

> **SandboxError** = *typeof* `SandboxError.Type`

Closed failure union for the provider-neutral sandbox boundary.

***

<a id="snapshotid-1"></a>

### SnapshotId

> **SnapshotId** = *typeof* `SnapshotId.Type`

Durable provider identity for one immutable sandbox image.

***

<a id="typescriptcommand"></a>

### TypeScriptCommand

> **TypeScriptCommand** = *typeof* `TypeScriptCommand.Type`

One stateful TypeScript cell evaluated in a sandbox-owned namespace.

## Variables

<a id="execevent-1"></a>

### ExecEvent

> `const` **ExecEvent**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Output"`, \{ `channel`: `Schema.Literals`\<readonly \[`"stdout"`, `"stderr"`\]\>; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Metadata"`, \{ `value`: `Schema.Unknown`; \}\>\]\>

One ordered command event.

***

<a id="execresult-1"></a>

### ExecResult

> `const` **ExecResult**: `Schema.Struct`\<\{ `exitCode`: `Schema.Int`; `stderr`: `Schema.String`; `stdout`: `Schema.String`; `value`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>

Collected terminal command result.

***

<a id="isolation-2"></a>

### Isolation

> `const` **Isolation**: `Schema.Literals`\<readonly \[`"process"`, `"v8-isolate"`, `"container"`, `"microvm"`\]\>

Factual physical boundary. It is not a security rating.

***

<a id="layerbunkernel"></a>

### layerBunKernel

> `const` **layerBunKernel**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](#sandboxprovider), `never`, `FileSystem.FileSystem` \| [`KernelPool`](./repl/namespaces/KernelPool#kernelpool) \| [`KernelSnapshotStore`](./repl/namespaces/KernelSnapshotStore#kernelsnapshotstore) \| `Path.Path`\>

Provide the process-isolated BunKernel Sandbox leaf.

#### Parameters

##### options

[`BunKernelOptions`](#bunkerneloptions)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](#sandboxprovider), `never`, `FileSystem.FileSystem` \| [`KernelPool`](./repl/namespaces/KernelPool#kernelpool) \| [`KernelSnapshotStore`](./repl/namespaces/KernelSnapshotStore#kernelsnapshotstore) \| `Path.Path`\>

***

<a id="layerworktree"></a>

### layerWorktree

> `const` **layerWorktree**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](#sandboxprovider), `never`, `FileSystem.FileSystem` \| `Path.Path` \| `ChildProcessSpawner.ChildProcessSpawner`\>

Provide a process-isolated Sandbox whose snapshots are hidden Git commits and whose forks are worktrees.

#### Parameters

##### options

[`WorktreeOptions`](#worktreeoptions)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](#sandboxprovider), `never`, `FileSystem.FileSystem` \| `Path.Path` \| `ChildProcessSpawner.ChildProcessSpawner`\>

***

<a id="limits-5"></a>

### Limits

> `const` **Limits**: `Schema.Struct`\<\{ `cpuMs`: `Schema.optionalKey`\<`Schema.Int`\>; `memoryMb`: `Schema.optionalKey`\<`Schema.Int`\>; `wallClock`: `Schema.optionalKey`\<`Schema.DurationFromMillis`\>; \}\>

Limits requested from and enforced by a sandbox provider.

***

<a id="make"></a>

### make

> `const` **make**: (`input`) => [`SandboxService`](#sandboxservice)

Construct collected and streaming variants from one scoped command start operation.

#### Parameters

##### input

`Omit`\<[`SandboxService`](#sandboxservice), `"exec"` \| `"stream"`\>

#### Returns

[`SandboxService`](#sandboxservice)

***

<a id="makebunkernelprovider"></a>

### makeBunKernelProvider

> `const` **makeBunKernelProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](#sandboxproviderservice), `never`, `FileSystem.FileSystem` \| [`KernelPool`](./repl/namespaces/KernelPool#kernelpool) \| [`KernelSnapshotStore`](./repl/namespaces/KernelSnapshotStore#kernelsnapshotstore) \| `Path.Path`\>

Construct a provider over an existing BunKernelPool and BunKernelSnapshotStore.

#### Parameters

##### options

[`BunKernelOptions`](#bunkerneloptions)

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](#sandboxproviderservice), `never`, `FileSystem.FileSystem` \| [`KernelPool`](./repl/namespaces/KernelPool#kernelpool) \| [`KernelSnapshotStore`](./repl/namespaces/KernelSnapshotStore#kernelsnapshotstore) \| `Path.Path`\>

***

<a id="metadata-1"></a>

### Metadata

> `const` **Metadata**: `Schema.TaggedStruct`\<`"Metadata"`, \{ `value`: `Schema.Unknown`; \}\>

Provider-specific structured progress retained for a typed adapter.

***

<a id="operation-2"></a>

### Operation

> `const` **Operation**: `Schema.Literals`\<readonly \[`"exec:process"`, `"exec:typescript"`, `"exec:javascript-module"`, `"files"`, `"pause"`, `"resume"`, `"snapshot"`, `"fork"`, `"limit:cpu"`, `"limit:memory"`, `"limit:wall-clock"`\]\>

Sandbox operation that a leaf may report as unsupported.

***

<a id="output-1"></a>

### Output

> `const` **Output**: `Schema.TaggedStruct`\<`"Output"`, \{ `channel`: `Schema.Literals`\<readonly \[`"stdout"`, `"stderr"`\]\>; `text`: `Schema.String`; \}\>

One streaming write from a sandbox command.

***

<a id="processcommand-1"></a>

### ProcessCommand

> `const` **ProcessCommand**: `Schema.TaggedStruct`\<`"Process"`, \{ `arguments`: `Schema.$Array`\<`Schema.String`\>; `command`: `Schema.String`; `cwd`: `Schema.optionalKey`\<`Schema.String`\>; `environment`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.String`\>\>; `stdin`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

A normal process invocation for providers that expose an operating-system command boundary.

***

<a id="sandboxerror-1"></a>

### SandboxError

> `const` **SandboxError**: `Schema.Union`\<readonly \[*typeof* [`Unsupported`](#unsupported), *typeof* [`Unavailable`](#unavailable), *typeof* [`ExecutionFailed`](#executionfailed), *typeof* [`LimitExceeded`](#limitexceeded), *typeof* [`SnapshotNotFound`](#snapshotnotfound)\]\>

Closed failure union for the provider-neutral sandbox boundary.

***

<a id="snapshotid-2"></a>

### SnapshotId

> `const` **SnapshotId**: `Schema.String`

Durable provider identity for one immutable sandbox image.

***

<a id="typescriptcommand-1"></a>

### TypeScriptCommand

> `const` **TypeScriptCommand**: `Schema.TaggedStruct`\<`"TypeScript"`, \{ `cellId`: `Schema.String`; `source`: `Schema.String`; \}\>

One stateful TypeScript cell evaluated in a sandbox-owned namespace.
