[**generalist**](../../../../index)

***

[generalist](../../../../index) / [runtime](../../../index) / [Messaging](../index) / MessagingPolicy

# MessagingPolicy

## Interfaces

### Service

#### Properties

##### allow

> `readonly` **allow**: (`input`) => `Effect`\<`boolean`\>

###### Parameters

###### input

[`PolicyInput`](../index#policyinput)

###### Returns

`Effect`\<`boolean`\>

##### discover

> `readonly` **discover**: (`sender`) => `Effect`\<readonly `string` & `Brand`\<`"Address"`\>[]\>

###### Parameters

###### sender

[`DirectoryEntry`](../../AgentDirectory#directoryentry)

###### Returns

`Effect`\<readonly `string` & `Brand`\<`"Address"`\>[]\>
