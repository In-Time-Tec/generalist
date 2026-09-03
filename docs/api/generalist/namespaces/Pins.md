[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Pins

# Pins

## Type Aliases

### AgentPin

> **AgentPin** = *typeof* `AgentPin.Type`

Exact identity of one closed Agent manifest.

***

### CapabilityPin

> **CapabilityPin** = *typeof* `CapabilityPin.Type`

Exact opaque identity of a tool, skill, service, or policy capability.

***

### ExecutablePin

> **ExecutablePin** = *typeof* `ExecutablePin.Type`

Exact identity of one complete executable closure.

***

### ModelPin

> **ModelPin** = *typeof* `ModelPin.Type`

Exact opaque identity of a model implementation and configuration.

***

### ProgramPin

> **ProgramPin** = *typeof* `ProgramPin.Type`

Exact identity of one closed Agent Program manifest.

## Variables

### AgentPin

> `const` **AgentPin**: `Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>

Exact identity of one closed Agent manifest.

***

### CapabilityPin

> `const` **CapabilityPin**: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>

Exact opaque identity of a tool, skill, service, or policy capability.

***

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

### ExecutablePin

> `const` **ExecutablePin**: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>

Exact identity of one complete executable closure.

***

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

### ModelPin

> `const` **ModelPin**: `Schema.brand`\<`Schema.String`, `"generalist/model-pin"`\>

Exact opaque identity of a model implementation and configuration.

***

### ProgramPin

> `const` **ProgramPin**: `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>

Exact identity of one closed Agent Program manifest.
