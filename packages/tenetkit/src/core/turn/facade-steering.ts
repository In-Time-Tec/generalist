import {
  Steering as Steering_Steering,
  SteeringQueueFull as Steering_SteeringQueueFull,
  layer as Steering_layer,
  layerTest as Steering_layerTest,
} from "./steering.js"
export const Steering = {
  Steering: Steering_Steering,
  SteeringQueueFull: Steering_SteeringQueueFull,
  layer: Steering_layer,
  layerTest: Steering_layerTest,
}
export namespace Steering {
  export type Steering = import("./steering.js").Steering
  export type SteeringQueueFull = import("./steering.js").SteeringQueueFull
  export type layer = typeof import("./steering.js").layer
  export type layerTest = typeof import("./steering.js").layerTest
  export type DrainMode = import("./steering.js").DrainMode
  export type Input = import("./steering.js").Input
  export type Service = import("./steering.js").Service
  export type MakeOptions = import("./steering.js").MakeOptions
  export type OverflowStrategy = import("./steering.js").OverflowStrategy
  export type QueueName = import("./steering.js").QueueName
  export type QueuePolicy = import("./steering.js").QueuePolicy
}
