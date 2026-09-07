[**generalist**](../../../../index.md)

***

[generalist](../../../../index.md) / [runtime](../../../index.md) / [Messaging](../index.md) / MessagingPolicy

# MessagingPolicy

## Interfaces

<a id="service"></a>

### Service

#### Properties

<a id="allow"></a>

##### allow

> `readonly` **allow**: (`input`) => `Effect`\<`boolean`\>

###### Parameters

###### input

[`PolicyInput`](../index.md#policyinput)

###### Returns

`Effect`\<`boolean`\>

<a id="discover"></a>

##### discover

> `readonly` **discover**: (`sender`) => `Effect`\<readonly `string` & `Brand`\<`"Address"`\>[]\>

###### Parameters

###### sender

[`DirectoryEntry`](../../AgentDirectory.md#directoryentry)

###### Returns

`Effect`\<readonly `string` & `Brand`\<`"Address"`\>[]\>
