import {
  InboxFull as Steering_InboxFull,
  PolicyInvalid as Steering_PolicyInvalid,
  Receipt as Steering_Receipt,
  RunClosed as Steering_RunClosed,
  defaultCapacity as Steering_defaultCapacity,
  defaultMaxPendingBytes as Steering_defaultMaxPendingBytes,
  promptBytes as Steering_promptBytes,
} from "./steering.js"
export const Steering = {
  InboxFull: Steering_InboxFull,
  PolicyInvalid: Steering_PolicyInvalid,
  Receipt: Steering_Receipt,
  RunClosed: Steering_RunClosed,
  defaultCapacity: Steering_defaultCapacity,
  defaultMaxPendingBytes: Steering_defaultMaxPendingBytes,
  promptBytes: Steering_promptBytes,
}
export namespace Steering {
  export type DrainMode = import("./steering.js").DrainMode
  export type InboxFull = import("./steering.js").InboxFull
  export type Input = import("./steering.js").Input
  export type Options = import("./steering.js").Options
  export type OverflowStrategy = import("./steering.js").OverflowStrategy
  export type PolicyInvalid = import("./steering.js").PolicyInvalid
  export type Producer = import("./steering.js").Producer
  export type QueueName = import("./steering.js").QueueName
  export type QueuePolicy = import("./steering.js").QueuePolicy
  export type Receipt = import("./steering.js").Receipt
  export type RunClosed = import("./steering.js").RunClosed
}
