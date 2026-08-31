/** @internal Runtime identity carried by an Agent closed over its environment. */
export const ClosedTypeId: unique symbol = Symbol.for("generalist/core/agent/closure/Closed")

/** @internal Whether a value carries the closed-Agent runtime identity. */
export const isClosed = <A extends object>(agent: A): agent is A & { readonly [ClosedTypeId]: true } =>
  ClosedTypeId in agent
