export interface PendingHostRequest {
  readonly module: string
  readonly operation: string
  readonly resolve: (value: unknown) => void
  readonly reject: (error: unknown) => void
}

const prototypes = new Map<string, object>()

export const actionable = (input: {
  readonly module: string
  readonly operation: string
  readonly output: unknown
}): unknown => {
  const { module, operation, output } = input
  const candidate = output as { readonly text?: unknown } | null
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    !Object.hasOwn(candidate, "text") ||
    typeof candidate.text !== "string"
  )
    return output
  const binding = `${module}.${operation}`
  let prototype = prototypes.get(binding)
  if (prototype === undefined) {
    const misuse = (): never => {
      throw new TypeError(`${binding} returns an object; did you mean \`.text\`?`)
    }
    prototype = Object.create(Object.prototype, {
      slice: { value: misuse },
      [Symbol.toPrimitive]: { value: misuse },
    }) as object
    prototypes.set(binding, prototype)
  }
  Object.setPrototypeOf(candidate, prototype)
  return candidate
}
