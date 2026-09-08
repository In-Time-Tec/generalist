[**generalist**](../../index.md)

***

[generalist](../../index.md) / [generalist](../index.md) / Pins

# Pins

## Type Aliases

<a id="agentpin"></a>

### AgentPin

> **AgentPin** = *typeof* `AgentPin.Type`

Exact identity of one closed Agent manifest.

***

<a id="capabilitypin"></a>

### CapabilityPin

> **CapabilityPin** = *typeof* `CapabilityPin.Type`

Exact opaque identity of a tool, skill, service, or policy capability.

***

<a id="executablepin"></a>

### ExecutablePin

> **ExecutablePin** = *typeof* `ExecutablePin.Type`

Exact identity of one complete executable closure.

***

<a id="modelpin"></a>

### ModelPin

> **ModelPin** = *typeof* `ModelPin.Type`

Exact opaque identity of a model implementation and configuration.

***

<a id="programpin"></a>

### ProgramPin

> **ProgramPin** = *typeof* `ProgramPin.Type`

Exact identity of one closed Agent Program manifest.

***

<a id="toolpin"></a>

### ToolPin

> **ToolPin** = *typeof* `ToolPin.Type`

## Variables

<a id="agentpin-1"></a>

### AgentPin

> `const` **AgentPin**: `Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>

Exact identity of one closed Agent manifest.

***

<a id="capabilitypin-1"></a>

### CapabilityPin

> `const` **CapabilityPin**: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>

Exact opaque identity of a tool, skill, service, or policy capability.

***

<a id="digest"></a>

### digest

> `const` **digest**: (`input`, `options?`) => `string`

Canonical SHA-256 identity for closed JSON values.

#### Parameters

##### input

`unknown`

##### options?

`ParseOptions`

#### Returns

`string`

***

<a id="executablepin-1"></a>

### ExecutablePin

> `const` **ExecutablePin**: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>

Exact identity of one complete executable closure.

***

<a id="makecapability"></a>

### makeCapability

> `const` **makeCapability**: (`input`, `options?`) => `string` & `Brand`

Construct the exact identity of a tool, skill, service, or policy capability.

#### Parameters

##### input

`unknown`

##### options?

`ParseOptions`

#### Returns

`string` & `Brand`

***

<a id="makemodel"></a>

### makeModel

> `const` **makeModel**: (`input`, `options?`) => `string` & `Brand`

Construct the exact identity of a model implementation and configuration.

#### Parameters

##### input

`unknown`

##### options?

`ParseOptions`

#### Returns

`string` & `Brand`

***

<a id="makeprogram"></a>

### makeProgram

> `const` **makeProgram**: (`input`, `options?`) => `string` & `Brand`

Construct the exact identity of one closed Agent Program manifest.

#### Parameters

##### input

`unknown`

##### options?

`ParseOptions`

#### Returns

`string` & `Brand`

***

<a id="maketool"></a>

### makeTool

> `const` **makeTool**: (`input`, `options?`) => `string` & `Brand`

#### Parameters

##### input

`unknown`

##### options?

`ParseOptions`

#### Returns

`string` & `Brand`

***

<a id="modelpin-1"></a>

### ModelPin

> `const` **ModelPin**: `Schema.brand`\<`Schema.String`, `"generalist/model-pin"`\>

Exact opaque identity of a model implementation and configuration.

***

<a id="programpin-1"></a>

### ProgramPin

> `const` **ProgramPin**: `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>

Exact identity of one closed Agent Program manifest.

***

<a id="toolpin-1"></a>

### ToolPin

> `const` **ToolPin**: `Schema.brand`\<`Schema.String`, `"generalist/tool-pin"`\>
