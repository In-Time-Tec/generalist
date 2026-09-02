import { Context, Effect } from "effect"
import type { TransportError } from "./errors.js"

/** @internal Test-only fault hook after an event has been admitted and its cursor advanced. */
export class ConnectionFault extends Context.Service<
  ConnectionFault,
  { readonly afterEvent: Effect.Effect<void, TransportError> }
>()("generalist/transport/connection-fault/ConnectionFault") {}
