type CoreMemory = import("../memory.js").Memory

import {
  itemFromPromptPart as Memory_itemFromPromptPart,
  isMessageFromRecall as Memory_isMessageFromRecall,
  messageFromRecall as Memory_messageFromRecall,
  replaceRecalledMessage as Memory_replaceRecalledMessage,
  recalledMessageIdentity as Memory_recalledMessageIdentity,
  projectTranscript as Memory_projectTranscript,
  MemoryError as Memory_MemoryError,
  Memory as Memory_Memory,
  merge as Memory_merge,
  layerNoop as Memory_layerNoop,
  layerTest as Memory_layerTest,
} from "../memory.js"
export const Memory = {
  itemFromPromptPart: Memory_itemFromPromptPart,
  isMessageFromRecall: Memory_isMessageFromRecall,
  messageFromRecall: Memory_messageFromRecall,
  replaceRecalledMessage: Memory_replaceRecalledMessage,
  recalledMessageIdentity: Memory_recalledMessageIdentity,
  projectTranscript: Memory_projectTranscript,
  MemoryError: Memory_MemoryError,
  Memory: Memory_Memory,
  merge: Memory_merge,
  layerNoop: Memory_layerNoop,
  layerTest: Memory_layerTest,
}
export namespace Memory {
  export type itemFromPromptPart = typeof import("../memory.js").itemFromPromptPart
  export type isMessageFromRecall = typeof import("../memory.js").isMessageFromRecall
  export type messageFromRecall = typeof import("../memory.js").messageFromRecall
  export type replaceRecalledMessage = typeof import("../memory.js").replaceRecalledMessage
  export type recalledMessageIdentity = typeof import("../memory.js").recalledMessageIdentity
  export type projectTranscript = typeof import("../memory.js").projectTranscript
  export type MemoryError = import("../memory.js").MemoryError
  export type Memory = CoreMemory
  export type merge = typeof import("../memory.js").merge
  export type layerNoop = typeof import("../memory.js").layerNoop
  export type layerTest = typeof import("../memory.js").layerTest
  export type ForgetInput = import("../memory.js").ForgetInput
  export type Interface = import("../memory.js").Interface
  export type Item = import("../memory.js").Item
  export type ItemPart = import("../memory.js").ItemPart
  export type Key = import("../memory.js").Key
  export type Metadata = import("../memory.js").Metadata
  export type RecallInput = import("../memory.js").RecallInput
  export type RememberInput = import("../memory.js").RememberInput
}
