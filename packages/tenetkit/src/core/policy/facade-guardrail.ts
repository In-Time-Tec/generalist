import {
  validateInput as Guardrail_validateInput,
  redactInput as Guardrail_redactInput,
  redactOutput as Guardrail_redactOutput,
  filterOutput as Guardrail_filterOutput,
} from "./guardrail.js"
export const Guardrail = {
  validateInput: Guardrail_validateInput,
  redactInput: Guardrail_redactInput,
  redactOutput: Guardrail_redactOutput,
  filterOutput: Guardrail_filterOutput,
}
export namespace Guardrail {
  export type validateInput = typeof import("./guardrail.js").validateInput
  export type redactInput = typeof import("./guardrail.js").redactInput
  export type redactOutput = typeof import("./guardrail.js").redactOutput
  export type filterOutput = typeof import("./guardrail.js").filterOutput
}
