import { Schema } from "effect"

export interface PendingHostRequest {
  readonly module: string
  readonly operation: string
  readonly resolve: (value: typeof Schema.Unknown.Type) => void
  readonly reject: (error: typeof Schema.Unknown.Type) => void
}

const TextResult = Schema.Struct({ text: Schema.String })
const isTextResult = Schema.is(TextResult)

export const actionable = <Output>(input: {
  readonly module: string
  readonly operation: string
  readonly output: Output
}): Output => {
  const { module, operation, output } = input
  if (!isTextResult(output) || Array.isArray(output) || !Object.hasOwn(output, "text")) return output
  const binding = `${module}.${operation}`
  const misuse = (): never => {
    throw new TypeError(`${binding} returns an object; did you mean \`.text\`?`)
  }
  const prototype = {}
  Object.defineProperties(prototype, {
    slice: { value: misuse },
    [Symbol.toPrimitive]: { value: misuse },
  })
  Object.setPrototypeOf(output, prototype)
  return output
}
