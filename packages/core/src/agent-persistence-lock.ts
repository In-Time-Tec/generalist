/** @effect-diagnostics missingPipeableSignature:skip-file */
import { Semaphore } from "effect"
import { Chat } from "effect/unstable/ai"

export interface PersistedChatLock {
  readonly semaphore: Semaphore.Semaphore
  users: number
}

export const persistenceLocks = new WeakMap<Chat.Persistence.Service, Map<string, PersistedChatLock>>()

export const reservePersistedChatLock = (persistence: Chat.Persistence.Service, chatId: string): PersistedChatLock => {
  const locks = persistenceLocks.get(persistence) ?? new Map<string, PersistedChatLock>()
  if (!persistenceLocks.has(persistence)) persistenceLocks.set(persistence, locks)
  const existing = locks.get(chatId)
  if (existing !== undefined) {
    existing.users += 1
    return existing
  }
  const created = { semaphore: Semaphore.makeUnsafe(1), users: 1 }
  locks.set(chatId, created)
  return created
}

export const releasePersistedChatLock = (
  persistence: Chat.Persistence.Service,
  chatId: string,
  lock: PersistedChatLock,
): void => {
  lock.users -= 1
  if (lock.users !== 0) return
  const locks = persistenceLocks.get(persistence)
  if (locks?.get(chatId) !== lock) return
  locks.delete(chatId)
  if (locks.size === 0) persistenceLocks.delete(persistence)
}
