import { Context } from "effect"
import type { Registration } from "../component.js"
import type { Checkpoint } from "./state.js"

export class Registry extends Context.Service<Registry, ReadonlyArray<Registration>>()(
  "generalist/core/durable/component/services/Registry",
) {}

export class SessionState extends Context.Service<
  SessionState,
  {
    readonly sessionId: string
    readonly components: ReadonlyArray<Checkpoint>
  }
>()("generalist/core/durable/component/services/SessionState") {}
