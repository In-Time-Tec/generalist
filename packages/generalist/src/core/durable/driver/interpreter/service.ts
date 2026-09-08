import { Context } from "effect"
import type { Service } from "../interpreter.js"

export class DriverInterpreter extends Context.Service<DriverInterpreter, Service>()(
  "generalist/core/durable/driver/interpreter/service/DriverInterpreter",
) {}
