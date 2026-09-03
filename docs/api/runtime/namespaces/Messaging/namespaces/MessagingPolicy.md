[**generalist**](../../../../index)

***

[generalist](../../../../index) / [runtime](../../../index) / [Messaging](../index) / MessagingPolicy

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

[`PolicyInput`](../index#policyinput)

###### Returns

`Effect`\<`boolean`\>

<a id="discover"></a>

##### discover

> `readonly` **discover**: (`sender`) => `Effect`\<readonly `string` & `Brand`\<`"Address"`\>[]\>

###### Parameters

###### sender

[`DirectoryEntry`](../../AgentDirectory#directoryentry)

###### Returns

`Effect`\<readonly `string` & `Brand`\<`"Address"`\>[]\>
