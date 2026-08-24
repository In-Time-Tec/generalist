import type { InitialChildInput, InitialFanOutInput } from "../runtime.js"
import { normalizePrompt } from "./prompt.js"

export const normalizeInitialChild = (child: InitialChildInput) => ({
  invocationId: child.invocationId,
  idempotencyKey: child.idempotencyKey,
  selection: child.selection,
  prompt: normalizePrompt(child.prompt),
  sessionId: child.sessionId,
  ...(child.messageId === undefined ? {} : { messageId: child.messageId }),
  ...(child.correlationId === undefined ? {} : { correlationId: child.correlationId }),
  ...(child.metadata === undefined ? {} : { metadata: child.metadata }),
})

export const normalizeInitialFanOut = (fanOut: InitialFanOutInput) => ({
  ...fanOut,
  members: fanOut.members.map((member) => ({
    ...member,
    prompt: normalizePrompt(member.prompt),
    ...(member.metadata === undefined ? {} : { metadata: member.metadata }),
  })),
})
